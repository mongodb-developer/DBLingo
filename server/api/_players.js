/**
 * Shared player helpers (not a route — Vercel ignores `_`-prefixed files).
 *
 * Shared devices: several participants can play on one browser in turn
 * ("Change path" → next person). Current frontends switch to a fresh userId
 * per participant, but older cached frontends reuse one userId per browser.
 * To make sure an earned score is never overwritten by the next person, a
 * request that arrives with a *different identity* for a userId that already
 * has points first archives the existing record (player + event scores) under
 * a new id, then lets the newcomer start fresh on the original id.
 */
import { getPlayers, getEventScores } from './_db.js';

const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
const digits = (v) => String(v || '').replace(/\D/g, '');

/** True when `incoming` clearly belongs to someone other than `existing`. */
export function isDifferentPerson(existing, incoming) {
  if (!existing) return false;
  const nameA = norm(existing.name);
  const nameB = norm(incoming.name);
  if (nameA && nameB && nameA !== 'anonymous' && nameA !== nameB) return true;
  const phoneA = digits(existing.phone);
  const phoneB = digits(incoming.phone);
  if (phoneA && phoneB && phoneA !== phoneB) return true;
  return false;
}

/**
 * If `userId` already has progress and `incoming` ({ name, phone? }) is a
 * different person, move the existing record and its event scores to an
 * archived id and reset `userId` to a fresh, zero-score record.
 * Returns the archived id, or null when nothing was archived.
 */
export async function archiveIfDifferentPerson(userId, incoming) {
  const players = await getPlayers();
  const existing = await players.findOne({ userId });
  if (!existing) return null;
  const hasProgress = (existing.xp || 0) > 0 || (existing.leaves || 0) > 0;
  if (!hasProgress || !isDifferentPerson(existing, incoming)) return null;

  const now = new Date();
  const archivedId = `${userId}~${now.getTime().toString(36)}`;
  const { _id, ...rest } = existing;
  await players.insertOne({ ...rest, userId: archivedId, archivedFrom: userId, archivedAt: now });

  const scores = await getEventScores();
  await scores.updateMany({ userId }, { $set: { userId: archivedId } });

  await players.updateOne(
    { userId },
    { $set: { xp: 0, leaves: 0, streak: 0, createdAt: now, updatedAt: now }, $unset: { phone: '' } }
  );
  console.log(`[dblingo] archived ${userId} -> ${archivedId} (new participant on shared device)`);
  return archivedId;
}
