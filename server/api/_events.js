/**
 * Shared event helpers (not a route — Vercel ignores `_`-prefixed files).
 *
 * Event leaderboards rank XP earned *during* an event: the first time a
 * player is recorded for an event we snapshot their current XP/leaves as a
 * baseline, and the event score is `current - baseline`. Event scores never
 * decrease, so a progress reset can neither erase nor double-count them.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { getEvents, getEventScores } from './_db.js';

export const EVENT_ID_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;

/** Normalise a user-supplied event id; returns '' if it isn't a valid slug. */
export function cleanEventId(value) {
  if (typeof value !== 'string') return '';
  const id = value.trim().toLowerCase();
  return EVENT_ID_RE.test(id) ? id : '';
}

/** Build a slug from an event name plus a short random suffix. */
export function slugify(name) {
  const base = String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return (base ? `${base}-${suffix}` : `event-${suffix}`);
}

/** 'upcoming' | 'live' | 'ended' for an event document at `now`. */
export function eventStatus(event, now = new Date()) {
  if (event.startsAt && now < new Date(event.startsAt)) return 'upcoming';
  if (event.endsAt && now > new Date(event.endsAt)) return 'ended';
  return 'live';
}

/** Public shape of an event (safe to return to any client).
 *  `qrVersion` is set when the event has a custom QR image; clients load it
 *  from GET /api/events?id=<id>&qr=1&v=<qrVersion> (the version busts caches).
 *  Events without one fall back to the frontend's default QR. */
export function publicEvent(event) {
  if (!event) return null;
  return {
    eventId: event.eventId,
    name: event.name,
    pack: event.pack || null,
    startsAt: event.startsAt || null,
    endsAt: event.endsAt || null,
    status: eventStatus(event),
    qrVersion: event.qr && event.qr.updatedAt ? new Date(event.qr.updatedAt).getTime() : null
  };
}

/** Never load the QR bytes for ordinary lookups — only the image endpoint needs them. */
export const EVENT_PROJECTION = { _id: 0, 'qr.data': 0 };

export async function findEvent(eventId) {
  const id = cleanEventId(eventId);
  if (!id) return null;
  const events = await getEvents();
  return events.findOne({ eventId: id }, { projection: EVENT_PROJECTION });
}

/* ---------- QR images ---------- */

export const QR_MAX_BYTES = 1024 * 1024; // 1 MB decoded

/** Identify an image by its magic bytes (the declared type isn't trusted). */
function sniffImageType(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 6 && buf.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Parse a `data:image/...;base64,...` URL into { data: Buffer, contentType }.
 * Returns { error } when it isn't a supported raster image within the size cap.
 * SVG is rejected on purpose (it can carry scripts).
 */
export function parseQrDataUrl(value) {
  if (typeof value !== 'string') return { error: 'qrImage must be a data URL' };
  const m = value.match(/^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return { error: 'qrImage must be a base64 PNG, JPEG, WebP or GIF data URL' };
  const data = Buffer.from(m[1].replace(/\s+/g, ''), 'base64');
  if (!data.length) return { error: 'qrImage is empty' };
  if (data.length > QR_MAX_BYTES) return { error: 'qrImage must be 1 MB or smaller' };
  const contentType = sniffImageType(data);
  if (!contentType) return { error: 'qrImage must be a PNG, JPEG, WebP or GIF image' };
  return { data, contentType };
}

/**
 * Admin check: `Authorization: Bearer <ADMIN_KEY>`.
 * Returns 'ok' | 'disabled' (no ADMIN_KEY configured) | 'denied'.
 */
export function checkAdmin(req) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return 'disabled';
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const supplied = String(header).replace(/^Bearer\s+/i, '');
  if (!supplied) return 'denied';
  // Compare fixed-length digests so timing doesn't leak the key length.
  const a = createHash('sha256').update(supplied).digest();
  const b = createHash('sha256').update(adminKey).digest();
  return timingSafeEqual(a, b) ? 'ok' : 'denied';
}

/**
 * Record a player's current totals against an event.
 * Only applied while the event is live. Returns the stored event score
 * (event xp/leaves) plus rank, or null if the event is missing / not live.
 */
export async function upsertEventScore({ eventId, userId, xp, leaves, streak, name, company }) {
  const event = await findEvent(eventId);
  if (!event || eventStatus(event) !== 'live') return null;

  const now = new Date();
  const set = { totalXp: xp, streak, updatedAt: now };
  // User-supplied strings are wrapped in $literal so values like "$foo"
  // are never interpreted as field paths inside the pipeline update.
  if (typeof name === 'string' && name.trim()) set.name = { $literal: name.trim().slice(0, 80) };
  if (typeof company === 'string') set.company = { $literal: company.trim().slice(0, 120) };

  const pipeline = [
    // 1) First sighting: snapshot baselines.
    { $set: {
      baselineXp: { $ifNull: ['$baselineXp', xp] },
      baselineLeaves: { $ifNull: ['$baselineLeaves', leaves] },
      joinedAt: { $ifNull: ['$joinedAt', now] },
      name: { $ifNull: ['$name', 'Anonymous'] },
      xp: { $ifNull: ['$xp', 0] },
      leaves: { $ifNull: ['$leaves', 0] }
    } },
    // 2) If totals dropped below the baseline (progress reset), lower it.
    { $set: {
      baselineXp: { $min: ['$baselineXp', xp] },
      baselineLeaves: { $min: ['$baselineLeaves', leaves] }
    } },
    // 3) Event score = gain over baseline, never decreasing.
    { $set: {
      ...set,
      xp: { $max: ['$xp', { $subtract: [xp, '$baselineXp'] }] },
      leaves: { $max: ['$leaves', { $subtract: [leaves, '$baselineLeaves'] }] }
    } }
  ];

  const scores = await getEventScores();
  const filter = { eventId: event.eventId, userId };
  try {
    await scores.updateOne(filter, pipeline, { upsert: true });
  } catch (err) {
    // Two concurrent first-time upserts can race on the unique index;
    // the retry then matches the freshly inserted document.
    if (err?.code !== 11000) throw err;
    await scores.updateOne(filter, pipeline, { upsert: true });
  }

  const me = await scores.findOne(filter, { projection: { _id: 0, xp: 1, leaves: 1 } });
  const ahead = await scores.countDocuments({ eventId: event.eventId, xp: { $gt: me?.xp ?? 0 } });
  return { eventId: event.eventId, xp: me?.xp ?? 0, leaves: me?.leaves ?? 0, rank: ahead + 1 };
}
