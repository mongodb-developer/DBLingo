/**
 * /api/events
 *
 * GET  ?id=<eventId>
 *   -> { ok, event: { eventId, name, pack, startsAt, endsAt, status } }
 *   Public. Used by the frontend to resolve an invite link (?event=<id>).
 *
 * GET  (no id, admin only)
 *   -> { ok, events: [...] }   most recent first
 *
 * GET  ?id=<eventId>&leaders=1&limit=25   (admin only)
 *   -> { ok, event, leaders: [{ rank, userId, name, company, phone, xp, leaves, streak, joinedAt, updatedAt }] }
 *   Top players of an event *with contact details* (phone) so organisers can
 *   reach the winners. Phone numbers are only ever returned here — the public
 *   /api/leaderboard never includes them.
 *
 * POST { name, eventId?, pack?, startsAt?, endsAt? }   (admin only)
 *   -> { ok, event }
 *   Header: Authorization: Bearer <ADMIN_KEY>
 *   eventId is optional — a slug is generated from the name if omitted.
 */
import { getEvents, getEventScores } from './_db.js';
import { handlePreflight, readJsonBody } from './_cors.js';
import { checkAdmin, cleanEventId, findEvent, publicEvent, slugify } from './_events.js';

function parseDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function requireAdmin(req, res) {
  const result = checkAdmin(req);
  if (result === 'ok') return true;
  if (result === 'disabled') {
    res.status(503).json({ error: 'Event creation is disabled (ADMIN_KEY not configured)' });
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
  return false;
}

/** Admin: event standings joined with each player's private contact details. */
async function handleAdminLeaders(req, res, id, limitParam) {
  if (!requireAdmin(req, res)) return;
  // Contains personal data — never let a browser or CDN cache it.
  res.setHeader('Cache-Control', 'no-store');

  const event = await findEvent(id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const n = Number(limitParam);
  const limit = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 500) : 25;

  const scores = await getEventScores();
  const leaders = await scores.aggregate([
    { $match: { eventId: event.eventId } },
    { $sort: { xp: -1, updatedAt: 1 } },
    { $limit: limit },
    // players.userId is uniquely indexed, so each lookup is a single index hit.
    { $lookup: {
      from: 'players',
      localField: 'userId',
      foreignField: 'userId',
      pipeline: [{ $project: { _id: 0, phone: 1, company: 1, name: 1 } }],
      as: 'player'
    } },
    { $set: { player: { $first: '$player' } } },
    { $project: {
      _id: 0,
      userId: 1,
      name: { $ifNull: ['$player.name', '$name'] },
      company: { $ifNull: ['$player.company', { $ifNull: ['$company', ''] }] },
      phone: { $ifNull: ['$player.phone', ''] },
      xp: 1, leaves: 1, streak: 1, joinedAt: 1, updatedAt: 1
    } }
  ]).toArray();

  const ranked = leaders.map((p, i) => ({ rank: i + 1, ...p }));
  return res.status(200).json({ ok: true, event: publicEvent(event), leaders: ranked });
}

async function handleGet(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const id = url.searchParams.get('id');

  if (id && url.searchParams.has('leaders')) {
    return handleAdminLeaders(req, res, id, url.searchParams.get('limit'));
  }

  if (id) {
    const event = await findEvent(id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    return res.status(200).json({ ok: true, event: publicEvent(event) });
  }

  if (!requireAdmin(req, res)) return;
  const events = await getEvents();
  const list = await events
    .find({}, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  return res.status(200).json({ ok: true, events: list.map(publicEvent) });
}

async function handlePost(req, res) {
  if (!requireAdmin(req, res)) return;

  const { name, eventId, pack, startsAt, endsAt } = readJsonBody(req);
  const cleanName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
  if (!cleanName) return res.status(400).json({ error: 'name is required' });

  let id;
  if (eventId !== undefined && eventId !== null && eventId !== '') {
    id = cleanEventId(eventId);
    if (!id) {
      return res.status(400).json({
        error: 'eventId must be 3-48 chars: lowercase letters, digits and dashes'
      });
    }
  } else {
    id = slugify(cleanName);
  }

  const start = parseDate(startsAt);
  const end = parseDate(endsAt);
  if (start === undefined || end === undefined) {
    return res.status(400).json({ error: 'startsAt / endsAt must be valid dates' });
  }
  if (start && end && end <= start) {
    return res.status(400).json({ error: 'endsAt must be after startsAt' });
  }

  const doc = {
    eventId: id,
    name: cleanName,
    pack: typeof pack === 'string' && pack.trim() ? pack.trim().slice(0, 60) : null,
    startsAt: start,
    endsAt: end,
    createdAt: new Date()
  };

  const events = await getEvents();
  try {
    await events.insertOne(doc);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: 'eventId already exists' });
    throw err;
  }
  return res.status(201).json({ ok: true, event: publicEvent(doc) });
}

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[dblingo] events error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
