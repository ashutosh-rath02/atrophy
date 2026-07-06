import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { INITIAL_RATING } from "../engine/scoring.js";
import { Store } from "../store/db.js";
import { buildSnapshot } from "./publish.js";

let dir: string;
let store: Store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "atrophy-pub-"));
  store = new Store(join(dir, "t.db"));
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("buildSnapshot", () => {
  it("averages all five axes, untested ones at the starting rating", () => {
    store.saveRating("syntax-recall", { rating: 1400, rd: 100, reps: 8 }, 2);
    const snap = buildSnapshot(store);
    expect(snap.overall).toBeCloseTo((1400 + 4 * INITIAL_RATING) / 5, 5);
    expect(snap.reps).toBe(8);
    expect(Object.keys(snap.axes)).toEqual(["syntax-recall"]);
  });

  it("cannot be inflated by hiding weak axes: more tested axes below start lower the overall", () => {
    store.saveRating("syntax-recall", { rating: 1400, rd: 100, reps: 8 }, 2);
    const before = buildSnapshot(store).overall;
    store.saveRating("debugging", { rating: 1100, rd: 100, reps: 3 }, 1);
    const after = buildSnapshot(store).overall;
    expect(after).toBeLessThan(before);
  });

  it("is all-1200 with no reps at all", () => {
    const snap = buildSnapshot(store);
    expect(snap.overall).toBe(INITIAL_RATING);
    expect(snap.reps).toBe(0);
    expect(snap.axes).toEqual({});
  });
});
