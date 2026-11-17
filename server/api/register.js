/**
 * POST /api/register
 * Body: { userId, name, company?, email?, pack?, eventId? }
 *
 * Upserts a player record. Called when a learner starts an assignment.
 * If eventId is given (and the event is live), also joins that event's
 * leaderboard, snapshotting the player's current XP as the event baseline.
 * Returns the stored player document (without _id), plus `event` when joined.
 *
 * `email` is validated when present (simple name@domain.tld shape) and
 * stored trimmed and lower-cased. It's optional here so older cached frontends keep working;
 * the onboarding form requires it. Email is never exposed on leaderboards.
 */
import { getPlayers } from './_db.js';
import { handlePreflight, readJsonBody } from './_cors.js';
import { upsertEventScore } from './_events.js';
import { archiveIfDifferentPerson } from './_players.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Returns the trimmed, lower-cased email, '' if absent, or null if invalid. */
function cleanEmail(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (!v) return '';
  return v.length <= 254 && EMAIL_RE.test(v) ? v : null;
}

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, name, company, email, pack, eventId } = readJsonBody(req);

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId is required' });
  }
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  const cleanedEmail = cleanEmail(email);
  if (cleanedEmail === null) {
    return res.status(400).json({ error: 'email is invalid' });
  }

  const now = new Date();
  const cleanName = String(name).trim().slice(0, 80);
  const cleanCompany = String(company || '').trim().slice(0, 120);
  const cleanPack = String(pack || 'general').trim().slice(0, 60);

  const set = { name: cleanName, company: cleanCompany, pack: cleanPack, updatedAt: now };
  // Only overwrite a stored email when a new one is supplied.
  if (cleanedEmail) set.email = cleanedEmail;

  try {
    // Shared device, new participant on an old id: keep the previous person's
    // score (archived under a new id) instead of overwriting it.
    await archiveIfDifferentPerson(userId, { name: cleanName, email: cleanedEmail });

    const players = await getPlayers();
    await players.updateOne(
      { userId },
      {
        $set: set,
        $setOnInsert: { userId, xp: 0, leaves: 0, streak: 0, createdAt: now, scoreAt: now }
      },
      { upsert: true }
    );

    // Never echo the email back: userIds are visible on public leaderboards,
    // so returning it here would let anyone look up a player's number.
    const player = await players.findOne(
      { userId },
      { projection: { _id: 0, email: 0 } }
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
