/**
 * Anti-abuse score rules (not a route — Vercel ignores `_`-prefixed files).
 *
 * Every content pack has 6 worlds × 4 levels (25 XP each, reorder levels 30)
 * plus one 90-second challenge per world (≤ 260 XP + 1 leaf; the final world
 * gives 5 leaves). That puts an honest, replay-free ceiling at:
 *     624 XP (levels) + 1560 XP (challenges) ≈ 2185 XP,  24 + 10 = 34 leaves
 *
 * Two server-side guards make replays and hand-edited localStorage useless:
 *  1. Hard cap at the honest maximum.
 *  2. Pace limit: XP/leaves can only grow as fast as a person can play.
 *     Anything faster is clamped, so a script that spams submissions gains
 *     no more than a fast human would.
 */
export const MAX_XP = Number(process.env.MAX_XP) || 2185;
export const MAX_LEAVES = Number(process.env.MAX_LEAVES) || 34;

// Fastest plausible pace: a challenge win (~260 XP) takes ≥ ~30 s of play,
// a level (25–30 XP) ≥ ~10 s. This is a token bucket keyed on a stored
// `paceAt` checkpoint: allowance accrues only with real elapsed time (up to
// BANK_MINUTES of saved-up play), and every accepted gain spends it. Rapid
// repeated requests therefore earn almost nothing extra.
const XP_PER_MIN = 400;
const LEAVES_PER_MIN = 6;
const BANK_MINUTES = 6;          // max saved-up allowance (≈2400 XP) for honest bursts
const FIRST_SYNC_MINUTES = 1.5;  // new players: ≈600 XP before the first sync

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const MIN = 60000;

/**
 * Accept a claimed total only within the cap and the pace allowance. Never
 * lowers an existing score (stored totals only go up — see leaderboard.js).
 *
 * @param {object|null} prev  stored { xp, leaves, paceAt? } or null
 * @param {{xp:number, leaves:number}} claimed
 * @param {Date} now
 * @returns {{ xp, leaves, limited, paceAt }}  paceAt = checkpoint to store
 */
export function limitScore(prev, claimed, now = new Date()) {
  const prevXp = clamp(prev?.xp || 0, 0, MAX_XP);
  const prevLeaves = clamp(prev?.leaves || 0, 0, MAX_LEAVES);
  const t = now.getTime();

  // Records from before this limiter (no paceAt) get a full bank so nobody
  // mid-event is penalised by the rollout; brand-new records (prev === null)
  // get the first-sync allowance.
  let checkpoint = prev?.paceAt
    ? new Date(prev.paceAt).getTime()
    : t - (prev ? BANK_MINUTES : FIRST_SYNC_MINUTES) * MIN;
  checkpoint = clamp(checkpoint, t - BANK_MINUTES * MIN, t);

  const availableMin = (t - checkpoint) / MIN;
  const xpRoom = prevXp + Math.floor(availableMin * XP_PER_MIN);
  const leafRoom = prevLeaves + Math.floor(availableMin * LEAVES_PER_MIN);

  const xp = clamp(Math.min(claimed.xp, xpRoom, MAX_XP), prevXp, MAX_XP);
  const leaves = clamp(Math.min(claimed.leaves, leafRoom, MAX_LEAVES), prevLeaves, MAX_LEAVES);

  // Spend the play time the accepted gain "costs".
  const spentMin = Math.max((xp - prevXp) / XP_PER_MIN, (leaves - prevLeaves) / LEAVES_PER_MIN);
  const paceAt = new Date(Math.min(t, checkpoint + spentMin * MIN));
  return { xp, leaves, limited: xp < claimed.xp || leaves < claimed.leaves, paceAt };
}
