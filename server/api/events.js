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
 * POST { name, eventId?, pack?, startsAt?, endsAt? }   (admin only)
 *   -> { ok, event }
 *   Header: Authorization: Bearer <ADMIN_KEY>
 *   eventId is optional — a slug is generated from the name if omitted.
 */
import { getEvents } from './_db.js';
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

async function handleGet(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const id = url.searchParams.get('id');

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
