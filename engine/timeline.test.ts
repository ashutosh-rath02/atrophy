import { describe, expect, it } from "vitest";
import type { SessionRow } from "../store/db.js";
import { INITIAL_RD, MIN_RD } from "./scoring.js";
import { buildAxisTimeline, buildTimelines } from "./timeline.js";

function session(ts: string, ratingAfter: number, mode: "ai-off" | "ai-on" = "ai-off"): SessionRow {
  return {
    id: 0,
    ts,
    exercise_id: "sr-py-001",
    axis: "syntax-recall",
    language: "python",
    tier: 1,
    mode,
    passed: 5,
    total: 5,
    elapsed_seconds: 100,
    score: 1,
    rating_before: 1200,
    rating_after: ratingAfter,
  };
}

const now = new Date("2026-07-05T12:00:00Z");

describe("buildAxisTimeline", () => {
  it("returns [] with no unaided reps", () => {
    expect(buildAxisTimeline([], now)).toEqual([]);
    expect(buildAxisTimeline([session("2026-07-01T10:00:00Z", 1210, "ai-on")], now)).toEqual([]);
  });

  it("puts a tightened-RD point at each rep and a decayed tail at now", () => {
    const pts = buildAxisTimeline([session("2026-07-01T10:00:00Z", 1210)], now);
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    expect(first.t).toBe("2026-07-01T10:00:00Z");
    expect(first.rating).toBe(1210);
    expect(first.rd).toBeLessThan(INITIAL_RD); // rep tightened it
    expect(last.t).toBe(now.toISOString());
    expect(last.rating).toBe(1210); // rating never moves without evidence
    expect(last.rd).toBeGreaterThan(first.rd); // …but confidence decayed
  });

  it("widens RD through idle gaps, monotonically", () => {
    const pts = buildAxisTimeline(
      [session("2026-06-01T10:00:00Z", 1210), session("2026-07-01T10:00:00Z", 1220)],
      now,
    );
    const between = pts.filter(
      (p) => Date.parse(p.t) > Date.parse("2026-06-01T10:00:00Z") && Date.parse(p.t) < Date.parse("2026-07-01T10:00:00Z"),
    );
    expect(between.length).toBeGreaterThan(2);
    for (let i = 1; i < between.length; i++) {
      // widening until it plateaus at the 350 cap
      expect(between[i]!.rd).toBeGreaterThanOrEqual(between[i - 1]!.rd);
      expect(between[i]!.rating).toBe(1210); // held flat through the gap
    }
    expect(between[1]!.rd).toBeGreaterThan(between[0]!.rd);
    // the second rep tightens again
    const atSecond = pts.find((p) => p.t === "2026-07-01T10:00:00Z")!;
    expect(atSecond.rd).toBeLessThan(between[between.length - 1]!.rd);
    expect(atSecond.rating).toBe(1220);
  });

  it("caps interpolation points for huge gaps", () => {
    const pts = buildAxisTimeline([session("2020-01-01T00:00:00Z", 1210)], now);
    expect(pts.length).toBeLessThanOrEqual(42);
  });

  it("keeps RD within [MIN_RD, 350] everywhere", () => {
    const reps = Array.from({ length: 30 }, (_, i) =>
      session(`2026-06-${String((i % 28) + 1).padStart(2, "0")}T0${i % 9}:00:00Z`, 1200 + i),
    );
    for (const p of buildAxisTimeline(reps, now)) {
      expect(p.rd).toBeGreaterThanOrEqual(MIN_RD);
      expect(p.rd).toBeLessThanOrEqual(350);
    }
  });
});

describe("buildTimelines", () => {
  it("keys every axis, [] where untested", () => {
    const t = buildTimelines([session("2026-07-01T10:00:00Z", 1210)], now);
    expect(t["syntax-recall"].length).toBeGreaterThan(0);
    expect(t.debugging).toEqual([]);
    expect(Object.keys(t)).toHaveLength(5);
  });
});
