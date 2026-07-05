import { describe, expect, it } from "vitest";
import {
  INITIAL_RD,
  K_EARLY,
  K_LATE,
  MAX_RD,
  MIN_RD,
  decayRd,
  exerciseScore,
  expectedScore,
  freshness,
  nextTier,
  timeFactor,
  updateRating,
} from "./scoring.js";

describe("timeFactor", () => {
  it("is 1.0 at or under the soft limit", () => {
    expect(timeFactor(0, 300)).toBe(1);
    expect(timeFactor(300, 300)).toBe(1);
  });
  it("decays smoothly past the limit", () => {
    const f = timeFactor(450, 300); // 50% over
    expect(f).toBeLessThan(1);
    expect(f).toBeCloseTo(Math.exp(-0.5), 5);
  });
  it("never drops below the floor", () => {
    expect(timeFactor(30_000, 300)).toBe(0.25);
  });
});

describe("exerciseScore", () => {
  it("multiplies correctness by time factor", () => {
    expect(exerciseScore(5, 5, 100, 300)).toBe(1);
    expect(exerciseScore(2, 4, 100, 300)).toBe(0.5);
  });
  it("handles zero tests defensively", () => {
    expect(exerciseScore(0, 0, 10, 300)).toBe(0);
  });
});

describe("expectedScore", () => {
  it("is 0.5 against an equal-rated tier", () => {
    expect(expectedScore(1200, 2)).toBeCloseTo(0.5, 5);
  });
  it("is higher against easier tiers", () => {
    expect(expectedScore(1200, 1)).toBeGreaterThan(0.5);
    expect(expectedScore(1200, 3)).toBeLessThan(0.5);
  });
});

describe("updateRating", () => {
  const fresh = { rating: 1200, rd: INITIAL_RD, reps: 0 };

  it("gains rating on a perfect score, loses on a zero", () => {
    expect(updateRating(fresh, 2, 1).rating).toBeGreaterThan(1200);
    expect(updateRating(fresh, 2, 0).rating).toBeLessThan(1200);
  });
  it("uses K=32 before 10 reps and K=16 after", () => {
    const early = updateRating(fresh, 2, 1).rating - 1200;
    const late = updateRating({ ...fresh, reps: 10 }, 2, 1).rating - 1200;
    expect(early).toBeCloseTo(K_EARLY * 0.5, 5);
    expect(late).toBeCloseTo(K_LATE * 0.5, 5);
  });
  it("tightens RD on every rep, bounded below", () => {
    let state = fresh;
    for (let i = 0; i < 50; i++) state = updateRating(state, 2, 1);
    expect(state.rd).toBe(MIN_RD);
    expect(state.reps).toBe(50);
  });
});

describe("decayRd", () => {
  it("does nothing for zero idle time", () => {
    expect(decayRd(100, 0)).toBe(100);
  });
  it("widens with idle days but caps at MAX_RD", () => {
    expect(decayRd(MIN_RD, 5)).toBeGreaterThan(MIN_RD);
    expect(decayRd(MIN_RD, 10_000)).toBe(MAX_RD);
  });
  it("fully cracks from MIN_RD in about 60 days", () => {
    expect(decayRd(MIN_RD, 60)).toBeCloseTo(MAX_RD, 5);
    expect(decayRd(MIN_RD, 30)).toBeLessThan(MAX_RD);
  });
  it("never lowers the deviation", () => {
    expect(decayRd(200, 1)).toBeGreaterThan(200);
  });
});

describe("freshness", () => {
  it("buckets RD into visual states", () => {
    expect(freshness(60)).toBe("fresh");
    expect(freshness(150)).toBe("aging");
    expect(freshness(250)).toBe("cracking");
    expect(freshness(340)).toBe("stale");
  });
});

describe("nextTier", () => {
  it("promotes after two strong passes", () => {
    expect(nextTier(1, [0.9, 0.85])).toBe(2);
  });
  it("demotes after two fails", () => {
    expect(nextTier(2, [0.1, 0.3])).toBe(1);
  });
  it("holds otherwise and clamps to [1,3]", () => {
    expect(nextTier(2, [0.9, 0.2])).toBe(2);
    expect(nextTier(2, [0.9])).toBe(2);
    expect(nextTier(3, [1, 1])).toBe(3);
    expect(nextTier(1, [0, 0])).toBe(1);
  });
});
