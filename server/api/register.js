/**
 * POST /api/register
 * Body: { userId, name, company?, pack?, eventId? }
 *
 * Upserts a player record. Called when a learner starts an assignment.
 * If eventId is given (and the event is live), also joins that event's
 * leaderboard, snapshotting the player's current XP as the event baseline.
 * Returns the stored player document (without _id), plus `event` when joined.
 */
import { getPlayers } from './_db.js';
import { handlePreflight, readJsonBody } from './_cors.js';
import { upsertEventScore } from './_events.js';

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, name, company, pack, eventId } = readJsonBody(req);

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId is required' });
  }
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }

  const now = new Date();
  const cleanName = String(name).trim().slice(0, 80);
  const cleanCompany = String(company || '').trim().slice(0, 120);
  const cleanPack = String(pack || 'general').trim().slice(0, 60);

  try {
    const players = await getPlayers();
    await players.updateOne(
      { userId },
      {
        $set: { name: cleanName, company: cleanCompany, pack: cleanPack, updatedAt: now },
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
    console.error('[mongolingo] register error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
