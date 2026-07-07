import { describe, expect, it } from "vitest";
import type { SessionRow } from "../store/db.js";
import { REPS_PER_WEEK_TARGET, computeStreak, weekStart } from "./streak.js";

// Wednesday 2026-07-08 12:00 UTC; its week starts Monday 2026-07-06
const NOW = new Date("2026-07-08T12:00:00Z");

function rep(ts: string, mode: "ai-off" | "ai-on" = "ai-off"): SessionRow {
  return {
    id: 0, ts, exercise_id: "x", axis: "syntax-recall", language: "python",
    tier: 1, mode, passed: 5, total: 5, elapsed_seconds: 60, score: 1,
    rating_before: 1200, rating_after: 1210,
  };
}

const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("weekStart", () => {
  it("returns the Monday of the week", () => {
    expect(weekStart(Date.parse("2026-07-08T12:00:00Z"))).toBe(Date.parse("2026-07-06T00:00:00Z"));
    expect(weekStart(Date.parse("2026-07-06T00:00:00Z"))).toBe(Date.parse("2026-07-06T00:00:00Z"));
    expect(weekStart(Date.parse("2026-07-05T23:00:00Z"))).toBe(Date.parse("2026-06-29T00:00:00Z"));
  });
});

describe("computeStreak", () => {
  it("is zero with no reps", () => {
    expect(computeStreak([], NOW)).toEqual({ weeks: 0, thisWeekReps: 0, target: REPS_PER_WEEK_TARGET });
  });

  it("counts this week once it reaches the target", () => {
    const one = computeStreak([rep(daysAgo(1))], NOW);
    expect(one.weeks).toBe(0);
    expect(one.thisWeekReps).toBe(1);
    const two = computeStreak([rep(daysAgo(1)), rep(daysAgo(2))], NOW);
    expect(two.weeks).toBe(1);
  });

  it("an in-progress week does not break last week's streak", () => {
    const s = computeStreak([rep(daysAgo(8)), rep(daysAgo(9))], NOW); // both last week
    expect(s.weeks).toBe(1);
    expect(s.thisWeekReps).toBe(0);
  });

  it("chains consecutive qualifying weeks and resets on a gap", () => {
    const chain = [
      rep(daysAgo(1)), rep(daysAgo(2)),   // this week: 2
      rep(daysAgo(8)), rep(daysAgo(9)),   // last week: 2
      rep(daysAgo(15)), rep(daysAgo(16)), // two weeks ago: 2
      rep(daysAgo(29)), rep(daysAgo(30)), // four weeks ago (gap at three): 2
    ];
    expect(computeStreak(chain, NOW).weeks).toBe(3);
  });

  it("ignores ai-on reps entirely", () => {
    const s = computeStreak([rep(daysAgo(1), "ai-on"), rep(daysAgo(2), "ai-on")], NOW);
    expect(s.weeks).toBe(0);
    expect(s.thisWeekReps).toBe(0);
  });

  it("one rep in a week is not enough to sustain the chain", () => {
    const s = computeStreak([rep(daysAgo(1)), rep(daysAgo(2)), rep(daysAgo(8))], NOW);
    expect(s.weeks).toBe(1); // this week qualifies; last week (1 rep) ends it
  });
});
