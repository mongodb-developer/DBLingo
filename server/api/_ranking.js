/**
 * Shared leaderboard ordering (not a route — Vercel ignores `_`-prefixed files).
 *
 * Players are ranked by:
 *   1. score (xp)            — higher first
 *   2. scoreAt               — who reached that score first (earlier first)
 *   3. streak                — longer current streak first
 *
 * `scoreAt` only moves when a player's XP actually increases, so re-syncs,
 * streak changes or idle refreshes never cost anyone their tie-break.
 */
export const RANK_SORT = { xp: -1, scoreAt: 1, streak: -1 };

/**
 * Filter matching everyone ranked strictly ahead of `me` (same tie-breaks as
 * RANK_SORT). `base` scopes it (e.g. { eventId } or { pack }).
 */
export function aheadOf(me, base = {}) {
  const xp = me?.xp ?? 0;
  const scoreAt = me?.scoreAt ? new Date(me.scoreAt) : new Date();
  const streak = me?.streak ?? 0;
  return {
    ...base,
    $or: [
      { xp: { $gt: xp } },
      { xp, scoreAt: { $lt: scoreAt } },
      { xp, scoreAt, streak: { $gt: streak } }
    ]
  };
}
