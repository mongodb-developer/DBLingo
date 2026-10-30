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
 * GET  ?id=<eventId>&qr=1&v=<qrVersion>   (public)
 *   -> the event's custom QR image (PNG/JPEG/WebP/GIF bytes), 404 if none.
 *
 * POST { name, eventId?, pack?, startsAt?, endsAt?, qrImage? }   (admin only)
 *   -> { ok, event }
 *   Header: Authorization: Bearer <ADMIN_KEY>
 *   eventId is optional — a slug is generated from the name if omitted.
 *   qrImage is an optional base64 data URL (≤ 1 MB, raster only).
 *
 * PATCH ?id=<eventId>  { qrImage: <data URL> | null }   (admin only)
 *   -> { ok, event }   set / replace / remove the event's QR image.
 */
import { getEvents, getEventScores } from './_db.js';
import { handlePreflight, readJsonBody } from './_cors.js';
import { checkAdmin, cleanEventId, findEvent, publicEvent, slugify, parseQrDataUrl, EVENT_PROJECTION } from './_events.js';

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

/** Public: stream an event's custom QR image (404 when it has none, so the
 *  frontend falls back to the default QR). Cached hard — the `v` param in the
 *  URL changes whenever the image is replaced. */
async function handleQrImage(res, id) {
  const eventIdClean = cleanEventId(id);
  if (!eventIdClean) return res.status(404).json({ error: 'Event not found' });
  const events = await getEvents();
  const doc = await events.findOne({ eventId: eventIdClean }, { projection: { _id: 0, qr: 1 } });
  if (!doc || !doc.qr || !doc.qr.data) return res.status(404).json({ error: 'No QR image for this event' });

  // The driver returns BSON Binary; normalise to a Node Buffer.
  const raw = doc.qr.data;
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw.buffer ?? raw);
  res.setHeader('Content-Type', doc.qr.contentType || 'image/png');
  res.setHeader('Content-Length', String(buf.length));
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(200).end(buf);
}

async function handleGet(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const id = url.searchParams.get('id');

  if (id && url.searchParams.has('leaders')) {
    return handleAdminLeaders(req, res, id, url.searchParams.get('limit'));
  }

  if (id && url.searchParams.has('qr')) {
    return handleQrImage(res, id);
  }

  if (id) {
    const event = await findEvent(id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    return res.status(200).json({ ok: true, event: publicEvent(event) });
  }

  if (!requireAdmin(req, res)) return;
  const events = await getEvents();
  const list = await events
    .find({}, { projection: EVENT_PROJECTION })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  return res.status(200).json({ ok: true, events: list.map(publicEvent) });
}

async function handlePost(req, res) {
  if (!requireAdmin(req, res)) return;

  const { name, eventId, pack, startsAt, endsAt, qrImage } = readJsonBody(req);
  const cleanName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
  if (!cleanName) return res.status(400).json({ error: 'name is required' });

  let qr = null;
  if (qrImage !== undefined && qrImage !== null && qrImage !== '') {
    const parsed = parseQrDataUrl(qrImage);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    qr = { data: parsed.data, contentType: parsed.contentType, updatedAt: new Date() };
  }

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
  if (qr) doc.qr = qr;

  const events = await getEvents();
  try {
    await events.insertOne(doc);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: 'eventId already exists' });
    throw err;
  }
  return res.status(201).json({ ok: true, event: publicEvent(doc) });
}

/**
 * PATCH ?id=<eventId>   (admin only)
 * Body: { qrImage: "data:image/png;base64,..." }  -> set / replace the QR image
 *       { qrImage: null }                          -> remove it (default QR is shown)
 */
async function handlePatch(req, res) {
  if (!requireAdmin(req, res)) return;
  const url = new URL(req.url, 'http://localhost');
  const id = cleanEventId(url.searchParams.get('id') || '');
  if (!id) return res.status(400).json({ error: 'id is required' });

  const body = readJsonBody(req);
  if (!('qrImage' in body)) return res.status(400).json({ error: 'Nothing to update (expected qrImage)' });

  let update;
  if (body.qrImage === null || body.qrImage === '') {
    update = { $unset: { qr: '' } };
  } else {
    const parsed = parseQrDataUrl(body.qrImage);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    update = { $set: { qr: { data: parsed.data, contentType: parsed.contentType, updatedAt: new Date() } } };
  }

  const events = await getEvents();
  const result = await events.findOneAndUpdate(
    { eventId: id },
    update,
    { returnDocument: 'after', projection: EVENT_PROJECTION }
  );
  if (!result) return res.status(404).json({ error: 'Event not found' });
  return res.status(200).json({ ok: true, event: publicEvent(result) });
}

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    if (req.method === 'PATCH') return await handlePatch(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[dblingo] events error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
