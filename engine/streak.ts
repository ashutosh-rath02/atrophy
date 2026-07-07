import type { SessionRow } from "../store/db.js";

/**
 * Week streaks (PLAN 3.1): consecutive weeks with at least REPS_PER_WEEK_TARGET
 * unaided reps. The current week never breaks a streak while it's still in
 * progress - it only extends it once it reaches the target.
 */

export const REPS_PER_WEEK_TARGET = 2;

const WEEK_MS = 7 * 86_400_000;

/** Monday 00:00 UTC of the week containing t. */
export function weekStart(t: number): number {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

export interface Streak {
  /** Completed consecutive weeks at target (including this week once it qualifies). */
  weeks: number;
  thisWeekReps: number;
  target: number;
}

export function computeStreak(sessions: SessionRow[], now = new Date()): Streak {
  const counts = new Map<number, number>();
  for (const s of sessions) {
    if (s.mode !== "ai-off") continue;
    const w = weekStart(Date.parse(s.ts));
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const thisWeek = weekStart(now.getTime());
  const thisWeekReps = counts.get(thisWeek) ?? 0;

  let weeks = 0;
  let w = thisWeekReps >= REPS_PER_WEEK_TARGET ? thisWeek : thisWeek - WEEK_MS;
  while ((counts.get(w) ?? 0) >= REPS_PER_WEEK_TARGET) {
    weeks++;
    w -= WEEK_MS;
  }
  return { weeks, thisWeekReps, target: REPS_PER_WEEK_TARGET };
}
