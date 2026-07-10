import { AXES, type Axis } from "../bank/schema.js";
import type { SessionRow } from "../store/db.js";

/**
 * Evidence-based decline detection: the proactive "scary chart" signal.
 * A regression is the current unaided rating sitting meaningfully below a
 * recent peak, computed only from graded reps (rating_after) - never from
 * confidence (RD) widening. It never fabricates a drop the reps did not
 * actually produce, which keeps it consistent with the tool's honesty rule.
 */

export const REGRESSION_WINDOW_DAYS = 56; // look back ~8 weeks
export const REGRESSION_MIN_DROP = 60; // Elo points from peak to latest
export const REGRESSION_MIN_REPS = 3; // enough in-window reps to mean something

const DAY_MS = 86_400_000;

export interface Regression {
  axis: Axis;
  fromRating: number; // the recent peak
  toRating: number; // the latest rep
  drop: number; // fromRating - toRating, always > 0
  fromTs: string;
  toTs: string;
  reps: number; // graded reps considered in the window
}

/** Detect a decline on one axis, or null if there is nothing to report. */
export function detectRegression(
  sessions: SessionRow[],
  axis: Axis,
  now: Date = new Date(),
): Regression | null {
  const cutoff = now.getTime() - REGRESSION_WINDOW_DAYS * DAY_MS;
  const reps = sessions
    .filter((s) => s.axis === axis && s.mode === "ai-off" && Date.parse(s.ts) >= cutoff)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  if (reps.length < REGRESSION_MIN_REPS) return null;

  let peak = reps[0]!;
  for (const s of reps) if (s.rating_after > peak.rating_after) peak = s;
  const latest = reps[reps.length - 1]!;

  // A decline requires the peak to come before the latest rep.
  if (Date.parse(peak.ts) >= Date.parse(latest.ts)) return null;

  const drop = peak.rating_after - latest.rating_after;
  if (drop < REGRESSION_MIN_DROP) return null;

  return {
    axis,
    fromRating: peak.rating_after,
    toRating: latest.rating_after,
    drop,
    fromTs: peak.ts,
    toTs: latest.ts,
    reps: reps.length,
  };
}

/** At most one regression per axis, worst drop first. */
export function detectRegressions(sessions: SessionRow[], now: Date = new Date()): Regression[] {
  return AXES.map((a) => detectRegression(sessions, a, now))
    .filter((r): r is Regression => r !== null)
    .sort((a, b) => b.drop - a.drop);
}
