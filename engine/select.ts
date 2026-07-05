import type { Axis, Exercise, Language } from "../bank/schema.js";

/**
 * Pick the next exercise: prefer the user's current tier, then nearest tiers;
 * within a tier avoid the most recently attempted ids so drills rotate.
 */
export function selectExercise(
  bank: Exercise[],
  axis: Axis,
  tier: number,
  recentIds: string[],
  language?: Language,
  random: () => number = Math.random,
): Exercise | undefined {
  const pool = bank.filter(
    (ex) => ex.axis === axis && (language === undefined || ex.language === language),
  );
  if (pool.length === 0) return undefined;

  const byTierDistance = [...new Set([tier, ...[1, 2, 3]])].sort(
    (a, b) => Math.abs(a - tier) - Math.abs(b - tier),
  );
  for (const t of byTierDistance) {
    const inTier = pool.filter((ex) => ex.tier === t);
    if (inTier.length === 0) continue;
    const unseen = inTier.filter((ex) => !recentIds.includes(ex.id));
    const candidates = unseen.length > 0 ? unseen : inTier;
    return candidates[Math.floor(random() * candidates.length)];
  }
  return undefined;
}
