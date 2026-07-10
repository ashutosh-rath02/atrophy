import { describe, expect, it } from "vitest";
import type { SessionRow } from "../store/db.js";
import { detectRegression, detectRegressions } from "./regression.js";

const NOW = new Date("2026-07-10T00:00:00Z");
const DAY = 86_400_000;

let seq = 0;
function sess(
  axis: string,
  ratingAfter: number,
  daysAgo: number,
  mode: "ai-off" | "ai-on" = "ai-off",
): SessionRow {
  seq += 1;
  return {
    id: seq,
    ts: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
    exercise_id: `x-${seq}`,
    axis,
    language: "python",
    tier: 1,
    mode,
    passed: 1,
    total: 1,
    elapsed_seconds: 10,
    score: 1,
    rating_before: ratingAfter,
    rating_after: ratingAfter,
  };
}

describe("detectRegression", () => {
  it("flags a sustained decline from a recent peak", () => {
    const s = [
      sess("debugging", 1200, 40),
      sess("debugging", 1300, 30), // peak
      sess("debugging", 1250, 20),
      sess("debugging", 1180, 5), // latest
    ];
    const r = detectRegression(s, "debugging", NOW);
    expect(r).not.toBeNull();
    expect(r!.fromRating).toBe(1300);
    expect(r!.toRating).toBe(1180);
    expect(r!.drop).toBe(120);
    expect(r!.reps).toBe(4);
  });

  it("returns null for a flat or improving history", () => {
    const s = [sess("debugging", 1200, 30), sess("debugging", 1210, 20), sess("debugging", 1230, 5)];
    expect(detectRegression(s, "debugging", NOW)).toBeNull();
  });

  it("ignores ai-on reps entirely", () => {
    const s = [
      sess("debugging", 1300, 30),
      sess("debugging", 1305, 20),
      sess("debugging", 1310, 10), // ai-off, flat/rising
      sess("debugging", 1100, 5, "ai-on"), // huge ai-on drop, must be ignored
    ];
    expect(detectRegression(s, "debugging", NOW)).toBeNull();
  });

  it("does not flag a drop below the threshold", () => {
    const s = [sess("debugging", 1250, 30), sess("debugging", 1240, 20), sess("debugging", 1220, 5)];
    expect(detectRegression(s, "debugging", NOW)).toBeNull();
  });

  it("does not flag while still climbing to a new peak", () => {
    const s = [sess("debugging", 1300, 30), sess("debugging", 1200, 20), sess("debugging", 1350, 5)];
    expect(detectRegression(s, "debugging", NOW)).toBeNull();
  });

  it("ignores reps outside the window", () => {
    const s = [
      sess("debugging", 1400, 200), // old peak, out of the 56-day window
      sess("debugging", 1210, 30),
      sess("debugging", 1200, 20),
      sess("debugging", 1195, 5),
    ];
    expect(detectRegression(s, "debugging", NOW)).toBeNull();
  });

  it("needs at least the minimum number of reps", () => {
    const s = [sess("debugging", 1300, 20), sess("debugging", 1180, 5)]; // only 2 reps
    expect(detectRegression(s, "debugging", NOW)).toBeNull();
  });
});

describe("detectRegressions", () => {
  it("returns at most one per axis, worst drop first", () => {
    const s = [
      sess("debugging", 1300, 30),
      sess("debugging", 1250, 20),
      sess("debugging", 1150, 5), // drop 150
      sess("code-reading", 1260, 30),
      sess("code-reading", 1240, 20),
      sess("code-reading", 1180, 5), // drop 80
    ];
    const out = detectRegressions(s, NOW);
    expect(out.map((r) => r.axis)).toEqual(["debugging", "code-reading"]);
    expect(out).toHaveLength(2);
  });

  it("is empty when nothing is declining", () => {
    expect(detectRegressions([sess("debugging", 1200, 5)], NOW)).toEqual([]);
  });
});
