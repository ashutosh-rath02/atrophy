/**
 * Generates dashboard/demo-data.json — a synthetic 5-week history used by the
 * hosted demo (GitHub Pages) and handy for dashboard development.
 *
 *   npm run seed:demo
 */
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Axis } from "../bank/schema.js";
import { buildPayload } from "../cli/serve.js";
import {
  INITIAL_RATING,
  INITIAL_RD,
  decayRd,
  updateRating,
  type RatingState,
} from "../engine/scoring.js";
import { Store } from "../store/db.js";

const dbPath = join(tmpdir(), "atrophy-demo-seed.db");
for (const suffix of ["", "-wal", "-shm"]) rmSync(dbPath + suffix, { force: true });
const store = new Store(dbPath);

const now = Date.now();
const day = (n: number) => new Date(now - n * 86_400_000);

interface Rep {
  daysAgo: number;
  score: number;
  tier: number;
  ex: string;
  lang: string;
}

// Deliberate shapes: steady practice (syntax-recall), abandonment (debugging —
// the band should visibly crack), sporadic reps elsewhere.
const plan: Record<Axis, Rep[]> = {
  "syntax-recall": [
    { daysAgo: 34, score: 0.72, tier: 1, ex: "sr-py-001", lang: "python" },
    { daysAgo: 31, score: 0.95, tier: 1, ex: "sr-js-001", lang: "javascript" },
    { daysAgo: 28, score: 1.0, tier: 1, ex: "sr-py-002", lang: "python" },
    { daysAgo: 25, score: 0.81, tier: 2, ex: "sr-py-003", lang: "python" },
    { daysAgo: 21, score: 0.66, tier: 2, ex: "sr-js-002", lang: "javascript" },
    { daysAgo: 17, score: 0.9, tier: 2, ex: "sr-py-002", lang: "python" },
    { daysAgo: 13, score: 1.0, tier: 2, ex: "sr-py-003", lang: "python" },
    { daysAgo: 9, score: 0.75, tier: 3, ex: "sr-py-004", lang: "python" },
    { daysAgo: 5, score: 0.88, tier: 3, ex: "sr-py-004", lang: "python" },
    { daysAgo: 1, score: 0.93, tier: 3, ex: "sr-py-004", lang: "python" },
  ],
  debugging: [
    { daysAgo: 33, score: 0.55, tier: 1, ex: "dbg-py-001", lang: "python" },
    { daysAgo: 29, score: 0.8, tier: 1, ex: "dbg-js-001", lang: "javascript" },
    { daysAgo: 26, score: 0.85, tier: 2, ex: "dbg-py-002", lang: "python" },
    { daysAgo: 22, score: 0.6, tier: 2, ex: "dbg-js-003", lang: "javascript" },
    { daysAgo: 19, score: 0.9, tier: 2, ex: "dbg-py-003", lang: "python" },
  ],
  "code-reading": [
    { daysAgo: 30, score: 0.5, tier: 1, ex: "cr-py-001", lang: "python" },
    { daysAgo: 20, score: 1.0, tier: 1, ex: "cr-js-001", lang: "javascript" },
    { daysAgo: 12, score: 0.0, tier: 2, ex: "cr-py-002", lang: "python" },
    { daysAgo: 4, score: 1.0, tier: 2, ex: "cr-js-003", lang: "javascript" },
  ],
  "api-memory": [
    { daysAgo: 27, score: 1.0, tier: 1, ex: "api-py-001", lang: "python" },
    { daysAgo: 24, score: 0.0, tier: 2, ex: "api-py-002", lang: "python" },
    { daysAgo: 23, score: 1.0, tier: 2, ex: "api-js-001", lang: "javascript" },
  ],
  decomposition: [
    { daysAgo: 18, score: 0.6, tier: 1, ex: "dec-any-001", lang: "any" },
    { daysAgo: 8, score: 0.8, tier: 2, ex: "dec-any-002", lang: "any" },
  ],
};

// Monthly AI-assisted comparison reps, consistently near-perfect: the gap.
const aiOn: Array<Rep & { axis: Axis }> = [
  { axis: "syntax-recall", daysAgo: 30, score: 1.0, tier: 2, ex: "sr-py-002", lang: "python" },
  { axis: "debugging", daysAgo: 27, score: 0.97, tier: 2, ex: "dbg-py-002", lang: "python" },
  { axis: "syntax-recall", daysAgo: 15, score: 1.0, tier: 3, ex: "sr-py-004", lang: "python" },
  { axis: "code-reading", daysAgo: 10, score: 0.95, tier: 2, ex: "cr-js-002", lang: "javascript" },
  { axis: "syntax-recall", daysAgo: 2, score: 1.0, tier: 3, ex: "sr-py-004", lang: "python" },
];

for (const [axis, reps] of Object.entries(plan) as [Axis, Rep[]][]) {
  let state: RatingState = { rating: INITIAL_RATING, rd: INITIAL_RD, reps: 0 };
  let prevDaysAgo: number | null = null;
  for (const r of reps) {
    if (prevDaysAgo !== null) {
      state = { ...state, rd: decayRd(state.rd, prevDaysAgo - r.daysAgo) };
    }
    const before = state.rating;
    state = updateRating(state, r.tier, r.score);
    store.recordSession({
      ts: day(r.daysAgo).toISOString(),
      exercise_id: r.ex,
      axis,
      language: r.lang,
      tier: r.tier,
      mode: "ai-off",
      passed: Math.round(r.score * 5),
      total: 5,
      elapsed_seconds: 120 + Math.round(r.score * 200),
      score: r.score,
      rating_before: before,
      rating_after: state.rating,
    });
    prevDaysAgo = r.daysAgo;
  }
  store.saveRating(axis, state, Math.min(3, 1 + Math.floor(reps.length / 4)), day(reps[reps.length - 1]!.daysAgo));
}

for (const r of aiOn) {
  store.recordSession({
    ts: day(r.daysAgo).toISOString(),
    exercise_id: r.ex,
    axis: r.axis,
    language: r.lang,
    tier: r.tier,
    mode: "ai-on",
    passed: Math.round(r.score * 5),
    total: 5,
    elapsed_seconds: 60 + Math.round(r.score * 60),
    score: r.score,
    rating_before: 1200,
    rating_after: 1200,
  });
}

const out = join(import.meta.dirname, "..", "dashboard", "demo-data.json");
writeFileSync(out, JSON.stringify(buildPayload(store)), "utf8");
store.close();
console.log("wrote", out);
