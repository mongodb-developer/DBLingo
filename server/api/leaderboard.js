/**
 * /api/leaderboard
 *
 * GET  ?pack=general&limit=10
 *   -> { ok, leaders: [{ userId, name, pack, xp, leaves, streak, rank }] }
 * GET  ?event=<eventId>&limit=10
 *   -> { ok, event, leaders: [...] }   ranked by XP earned during the event
 *
 * POST { userId, xp, leaves?, streak?, eventId? }
 *   -> updates a player's score (latest wins) and returns their rank.
 *      With eventId (and the event live), also updates the event score
 *      and returns { event: { eventId, xp, leaves, rank } }.
 *
 * The player must already exist (via /api/register). If not, POST upserts
 * a minimal record so a score is never lost.
 */
import { getPlayers, getEventScores } from './_db.js';
import { handlePreflight, readJsonBody } from './_cors.js';
import { findEvent, publicEvent, upsertEventScore } from './_events.js';
import { archiveIfDifferentPerson } from './_players.js';

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

async function handleEventGet(res, eventId, limit) {
  const event = await findEvent(eventId);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const scores = await getEventScores();
  const leaders = await scores
    .find(
      { eventId: event.eventId },
      { projection: { _id: 0, userId: 1, name: 1, xp: 1, leaves: 1, streak: 1 } }
    )
    .sort({ xp: -1, updatedAt: 1 })
    .limit(limit)
    .toArray();

  const ranked = leaders.map((p, i) => ({ ...p, rank: i + 1 }));
  return res.status(200).json({ ok: true, event: publicEvent(event), leaders: ranked });
}

async function handleGet(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pack = url.searchParams.get('pack');
  const eventId = url.searchParams.get('event');
  const limit = Math.min(toInt(url.searchParams.get('limit'), 10) || 10, 100);

  if (eventId) return handleEventGet(res, eventId, limit);

  const filter = pack ? { pack } : {};

  const players = await getPlayers();
  const leaders = await players
    .find(filter, { projection: { _id: 0, company: 0, phone: 0 } })
    .sort({ xp: -1, updatedAt: 1 })
    .limit(limit)
    .toArray();

  const ranked = leaders.map((p, i) => ({ ...p, rank: i + 1 }));
  return res.status(200).json({ ok: true, leaders: ranked });
}

async function handlePost(req, res) {
  const { userId, xp, leaves, streak, name, company, pack, eventId } = readJsonBody(req);

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId is required' });
  }

  const now = new Date();
  // Earned totals only ever go up: a device that resets local progress
  // (e.g. "Change path" on an older frontend) can't wipe a saved score.
  const set = { streak: toInt(streak), updatedAt: now };
  const max = { xp: toInt(xp), leaves: toInt(leaves) };
  if (typeof name === 'string') set.name = name.trim().slice(0, 80);
  if (typeof company === 'string') set.company = company.trim().slice(0, 120);
  if (typeof pack === 'string') set.pack = pack.trim().slice(0, 60);

  // Build $setOnInsert without any path that already appears in $set,
  // otherwise MongoDB throws a path-conflict error on upsert.
  const setOnInsert = { userId, createdAt: now };
  if (!('name' in set)) setOnInsert.name = 'Anonymous';

  if (set.name) await archiveIfDifferentPerson(userId, { name: set.name });

  const players = await getPlayers();
  await players.updateOne(
    { userId },
    { $set: set, $max: max, $setOnInsert: setOnInsert },
    { upsert: true }
  );

  const me = await players.findOne({ userId }, { projection: { _id: 0, phone: 0 } });
  // Rank = number of players with strictly higher xp, +1.
  const ahead = await players.countDocuments({
    ...(me?.pack ? { pack: me.pack } : {}),
    xp: { $gt: me?.xp ?? 0 }
  });

  // Use the stored (never-decreasing) totals for the event score too.
  const event = eventId
    ? await upsertEventScore({
      eventId, userId,
      xp: me?.xp ?? max.xp, leaves: me?.leaves ?? max.leaves, streak: set.streak,
      name: me?.name, company: me?.company
    })
    : null;

  return res.status(200).json({ ok: true, player: me, rank: ahead + 1, event });
}

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[dblingo] leaderboard error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
