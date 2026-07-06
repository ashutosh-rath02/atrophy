import { AXES, type Axis } from "../bank/schema.js";
import type { SessionRow } from "../store/db.js";
import { INITIAL_RATING, INITIAL_RD, decayRd, shrinkRd } from "./scoring.js";

/**
 * One point on an axis's decay curve. Between reps the rating holds and the
 * RD (confidence band) widens; at each rep the rating jumps and the band
 * tightens. The dashboard just draws these — all decay math stays here.
 */
export interface TimelinePoint {
  t: string;
  rating: number;
  rd: number;
}

/** Cap interpolation so a months-long gap doesn't emit hundreds of points. */
const MAX_STEPS_PER_GAP = 40;

const DAY_MS = 86_400_000;

function interpolateGap(
  points: TimelinePoint[],
  fromTs: number,
  toTs: number,
  rating: number,
  rdAtFrom: number,
): void {
  const gapDays = (toTs - fromTs) / DAY_MS;
  if (gapDays <= 1) return;
  const steps = Math.min(Math.ceil(gapDays), MAX_STEPS_PER_GAP);
  for (let i = 1; i < steps; i++) {
    const t = fromTs + ((toTs - fromTs) * i) / steps;
    points.push({
      t: new Date(t).toISOString(),
      rating,
      rd: decayRd(rdAtFrom, (t - fromTs) / DAY_MS),
    });
  }
}

/**
 * Replay one axis's unaided sessions into a rating ± RD curve, with
 * interpolated points through idle gaps (that's the visible "cracking")
 * and a tail from the last rep to `now`.
 */
export function buildAxisTimeline(sessions: SessionRow[], now: Date): TimelinePoint[] {
  const reps = sessions
    .filter((s) => s.mode === "ai-off")
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  if (reps.length === 0) return [];

  const points: TimelinePoint[] = [];
  let rating = INITIAL_RATING;
  let rd = INITIAL_RD;
  let prevTs: number | null = null;

  for (const s of reps) {
    const ts = Date.parse(s.ts);
    let rdHere = rd;
    if (prevTs !== null) {
      interpolateGap(points, prevTs, ts, rating, rd);
      rdHere = decayRd(rd, (ts - prevTs) / DAY_MS);
    }
    rating = s.rating_after;
    rd = shrinkRd(rdHere);
    points.push({ t: s.ts, rating, rd });
    prevTs = ts;
  }

  const nowTs = now.getTime();
  if (prevTs !== null && nowTs > prevTs) {
    interpolateGap(points, prevTs, nowTs, rating, rd);
    points.push({
      t: now.toISOString(),
      rating,
      rd: decayRd(rd, (nowTs - prevTs) / DAY_MS),
    });
  }
  return points;
}

/** All axes at once, keyed by axis; axes with no unaided reps map to []. */
export function buildTimelines(
  sessions: SessionRow[],
  now = new Date(),
): Record<Axis, TimelinePoint[]> {
  const out = {} as Record<Axis, TimelinePoint[]>;
  for (const axis of AXES) {
    out[axis] = buildAxisTimeline(
      sessions.filter((s) => s.axis === axis),
      now,
    );
  }
  return out;
}
