/**
 * Shared leaderboard ordering (not a route — Vercel ignores `_`-prefixed files).
 *
 * Players are ranked by:
 *   1. score (xp)       — higher first
 *   2. bestStreak       — longest clean streak ever reached (higher first)
 *   3. scoreAt          — who reached that score first (earlier first)
 *
 * `bestStreak` only ever goes up (a mistake resets the current streak, not
 * the best). `scoreAt` only moves when XP actually increases, so re-syncs or
 * idle refreshes never cost anyone their tie-break.
 */
export const RANK_SORT = { xp: -1, bestStreak: -1, scoreAt: 1 };

/**
 * Filter matching everyone ranked strictly ahead of `me` (same order as
 * RANK_SORT). `base` scopes it (e.g. { eventId } or { pack }).
 */
export function aheadOf(me, base = {}) {
  const xp = me?.xp ?? 0;
  const best = me?.bestStreak ?? 0;
  const scoreAt = me?.scoreAt ? new Date(me.scoreAt) : new Date();
  return {
    ...base,
    $or: [
      { xp: { $gt: xp } },
      { xp, bestStreak: { $gt: best } },
      { xp, bestStreak: best, scoreAt: { $lt: scoreAt } }
    ]
  };
}
