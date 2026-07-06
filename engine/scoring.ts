/**
 * Scoring model (PLAN §3.4):
 *  - per-exercise score = correctness × time-decay factor (soft limits only)
 *  - per-axis Elo rating so scores compare across difficulties
 *  - Glicko-style rating deviation (RD): inactivity widens confidence,
 *    it never lowers the rating itself without evidence.
 */

export const INITIAL_RATING = 1200;
export const INITIAL_RD = 350;
export const MIN_RD = 50;
export const MAX_RD = 350;

/** Elo K-factor: aggressive while calibrating, stable after 10 reps. */
export const K_EARLY = 32;
export const K_LATE = 16;
export const K_SWITCH_REPS = 10;

/** RD growth constant: from MIN_RD, confidence fully "cracks" in ~60 idle days. */
const RD_GROWTH_C = Math.sqrt((MAX_RD ** 2 - MIN_RD ** 2) / 60);

/** How much a completed rep tightens the deviation. */
const RD_SHRINK_FACTOR = 0.85;

/** One rep's worth of confidence tightening (shared by updates and replays). */
export function shrinkRd(rd: number): number {
  return Math.max(MIN_RD, rd * RD_SHRINK_FACTOR);
}

/** Effective opponent rating per difficulty tier. */
export const TIER_RATING: Record<number, number> = { 1: 1000, 2: 1200, 3: 1400 };

/** Score floor so a solved-but-slow exercise still counts for something. */
const TIME_FACTOR_FLOOR = 0.25;

/**
 * 1.0 up to the soft limit, then exponential decay with the soft limit as
 * half-life-ish scale, floored — a slow correct answer beats a fast wrong one.
 */
export function timeFactor(elapsedSeconds: number, softLimitSeconds: number): number {
  if (elapsedSeconds <= softLimitSeconds) return 1;
  const over = (elapsedSeconds - softLimitSeconds) / softLimitSeconds;
  return Math.max(TIME_FACTOR_FLOOR, Math.exp(-over));
}

/** correctness in [0,1] (passed/total) × time factor → exercise score in [0,1]. */
export function exerciseScore(
  passed: number,
  total: number,
  elapsedSeconds: number,
  softLimitSeconds: number,
): number {
  if (total <= 0) return 0;
  return (passed / total) * timeFactor(elapsedSeconds, softLimitSeconds);
}

export interface RatingState {
  rating: number;
  rd: number;
  reps: number;
}

export function expectedScore(rating: number, tier: number): number {
  const opponent = TIER_RATING[tier] ?? INITIAL_RATING;
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/** Apply one drill result to an axis rating. */
export function updateRating(state: RatingState, tier: number, score: number): RatingState {
  const k = state.reps < K_SWITCH_REPS ? K_EARLY : K_LATE;
  const rating = state.rating + k * (score - expectedScore(state.rating, tier));
  return { rating, rd: shrinkRd(state.rd), reps: state.reps + 1 };
}

/** Widen RD for idle time. Rating is untouched — we lose confidence, not skill. */
export function decayRd(rd: number, idleDays: number): number {
  if (idleDays <= 0) return rd;
  return Math.min(MAX_RD, Math.sqrt(rd ** 2 + RD_GROWTH_C ** 2 * idleDays));
}

export type Freshness = "fresh" | "aging" | "cracking" | "stale";

/** Bucket the current RD into the dashboard's "cracked skill" visual states. */
export function freshness(rd: number): Freshness {
  if (rd < 120) return "fresh";
  if (rd < 200) return "aging";
  if (rd < 300) return "cracking";
  return "stale";
}

/** Adaptive tier: 2 consecutive strong passes promote, 2 fails demote (PLAN §3.3). */
export const PROMOTE_SCORE = 0.8;
export const DEMOTE_SCORE = 0.4;

export function nextTier(currentTier: number, lastTwoScores: number[]): number {
  if (lastTwoScores.length >= 2) {
    const [a, b] = [lastTwoScores[0]!, lastTwoScores[1]!];
    if (a >= PROMOTE_SCORE && b >= PROMOTE_SCORE) return Math.min(3, currentTier + 1);
    if (a < DEMOTE_SCORE && b < DEMOTE_SCORE) return Math.max(1, currentTier - 1);
  }
  return currentTier;
}
