import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { INITIAL_RATING, INITIAL_RD, MAX_RD } from "../engine/scoring.js";
import { Store } from "./db.js";

let dir: string;
let store: Store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "atrophy-db-"));
  store = new Store(join(dir, "test.db"));
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("Store", () => {
  it("returns pristine defaults for an unseen axis", () => {
    const r = store.getRating("debugging");
    expect(r).toMatchObject({ rating: INITIAL_RATING, rd: INITIAL_RD, reps: 0, tier: 1, updatedAt: null });
  });

  it("round-trips a rating", () => {
    store.saveRating("syntax-recall", { rating: 1234, rd: 200, reps: 3 }, 2);
    const r = store.getRating("syntax-recall");
    expect(r.rating).toBe(1234);
    expect(r.reps).toBe(3);
    expect(r.tier).toBe(2);
  });

  it("widens RD with idle time on read, never touching the rating", () => {
    const past = new Date(Date.now() - 30 * 86_400_000);
    store.saveRating("syntax-recall", { rating: 1300, rd: 60, reps: 5 }, 1, past);
    const r = store.getRating("syntax-recall");
    expect(r.rating).toBe(1300);
    expect(r.rd).toBeGreaterThan(60);
    expect(r.rd).toBeLessThanOrEqual(MAX_RD);
  });

  it("records and orders sessions, newest first", () => {
    const base = {
      exercise_id: "sr-py-001",
      axis: "syntax-recall",
      language: "python",
      tier: 1,
      mode: "ai-off" as const,
      passed: 5,
      total: 5,
      elapsed_seconds: 120,
      score: 1,
      rating_before: 1200,
      rating_after: 1216,
    };
    store.recordSession({ ...base, ts: "2026-07-01T10:00:00Z" });
    store.recordSession({ ...base, ts: "2026-07-03T10:00:00Z", exercise_id: "sr-py-002" });
    const recent = store.recentSessions("syntax-recall", 5);
    expect(recent.map((s) => s.exercise_id)).toEqual(["sr-py-002", "sr-py-001"]);
    expect(store.allSessions()).toHaveLength(2);
  });
});
