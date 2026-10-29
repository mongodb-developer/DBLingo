/**
 * POST /api/register
 * Body: { userId, name, company?, phone?, pack?, eventId? }
 *
 * Upserts a player record. Called when a learner starts an assignment.
 * If eventId is given (and the event is live), also joins that event's
 * leaderboard, snapshotting the player's current XP as the event baseline.
 * Returns the stored player document (without _id), plus `event` when joined.
 *
 * `phone` is validated when present (7–15 digits, optional leading "+",
 * spaces / dashes / dots / parentheses allowed) and stored as entered
 * (trimmed). It's optional here so older cached frontends keep working;
 * the onboarding form requires it. Phone is never exposed on leaderboards.
 */
import { getPlayers } from './_db.js';
import { handlePreflight, readJsonBody } from './_cors.js';
import { upsertEventScore } from './_events.js';

const PHONE_RE = /^\+?[0-9\s().-]+$/;

/** Returns the trimmed phone, '' if absent, or null if invalid. */
function cleanPhone(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return '';
  if (v.length > 24 || !PHONE_RE.test(v)) return null;
  const digits = v.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15 ? v : null;
}

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, name, company, phone, pack, eventId } = readJsonBody(req);

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId is required' });
  }
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  const cleanedPhone = cleanPhone(phone);
  if (cleanedPhone === null) {
    return res.status(400).json({ error: 'phone is invalid' });
  }

  const now = new Date();
  const cleanName = String(name).trim().slice(0, 80);
  const cleanCompany = String(company || '').trim().slice(0, 120);
  const cleanPack = String(pack || 'general').trim().slice(0, 60);

  const set = { name: cleanName, company: cleanCompany, pack: cleanPack, updatedAt: now };
  // Only overwrite a stored phone when a new one is supplied.
  if (cleanedPhone) set.phone = cleanedPhone;

  try {
    const players = await getPlayers();
    await players.updateOne(
      { userId },
      {
        $set: set,
        $setOnInsert: { userId, xp: 0, leaves: 0, streak: 0, createdAt: now }
      },
      { upsert: true }
    );

    const player = await players.findOne(
      { userId },
      { projection: { _id: 0 } }
    );

    const joined = eventId
      ? await upsertEventScore({
        eventId, userId,
        xp: player?.xp || 0, leaves: player?.leaves || 0, streak: player?.streak || 0,
        name: player?.name, company: player?.company
      })
      : null;

    return res.status(200).json({ ok: true, player, event: joined });
  } catch (err) {
    console.error('[dblingo] register error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
