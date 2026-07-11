import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Store } from "../store/db.js";
import { buildReport, renderMarkdown, renderSvg, type ReportModel } from "./report.js";

let dir: string;
let store: Store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "atrophy-report-"));
  store = new Store(join(dir, "t.db"));
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

function sess(mode: "ai-off" | "ai-on", score: number, ts: string) {
  store.recordSession({
    ts,
    exercise_id: "x",
    axis: "debugging",
    language: "python",
    tier: 1,
    mode,
    passed: score,
    total: 1,
    elapsed_seconds: 10,
    score,
    rating_before: 1200,
    rating_after: 1200,
  });
}

describe("buildReport", () => {
  it("summarizes ratings, overall, and untested axes", () => {
    store.saveRating("debugging", { rating: 1320, rd: 90, reps: 8 }, 2);
    const m = buildReport(store);
    const dbg = m.axes.find((a) => a.axis === "debugging")!;
    expect(dbg.rating).toBe(1320);
    expect(dbg.reps).toBe(8);
    expect(dbg.state).not.toBe("untested");
    const untested = m.axes.find((a) => a.axis === "code-reading")!;
    expect(untested.rating).toBeNull();
    expect(untested.state).toBe("untested");
    // overall = mean across 5 axes with untested at 1200
    expect(m.overall).toBe(Math.round((1320 + 4 * 1200) / 5));
  });

  it("computes the with/without-AI gap only when both exist", () => {
    expect(buildReport(store).gap).toBeNull();
    sess("ai-off", 0.5, "2026-07-01T10:00:00Z");
    sess("ai-on", 0.9, "2026-07-02T10:00:00Z");
    const m = buildReport(store);
    expect(m.gap).toBeCloseTo(0.4, 5);
  });
});

const model: ReportModel = {
  generatedAt: "2026-07-10T00:00:00Z",
  overall: 1193,
  totalReps: 6,
  streakWeeks: 1,
  axes: [
    { axis: "syntax-recall", rating: 1215, reps: 2, state: "calibrating" },
    { axis: "debugging", rating: 1208, reps: 1, state: "calibrating" },
    { axis: "code-reading", rating: null, reps: 0, state: "untested" },
    { axis: "api-memory", rating: 1176, reps: 1, state: "calibrating" },
    { axis: "decomposition", rating: 1188, reps: 1, state: "calibrating" },
  ],
  gap: 0.3,
};

describe("renderMarkdown", () => {
  it("includes the overall, each axis, and the gap", () => {
    const md = renderMarkdown(model);
    expect(md).toContain("Overall 1193");
    expect(md).toContain("| syntax-recall | 1215 | 2 | calibrating |");
    expect(md).toContain("| code-reading | - | 0 | untested |");
    expect(md).toContain("gap: +0.30");
    expect(md).toContain("github.com/ashutosh-rath02/atrophy");
  });
  it("omits the gap line when there is no gap", () => {
    expect(renderMarkdown({ ...model, gap: null })).not.toContain("gap:");
  });
});

describe("renderSvg", () => {
  it("is a self-contained svg with the overall and axis names", () => {
    const svg = renderSvg(model);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain(">1193<");
    expect(svg).toContain("debugging");
    expect(svg).toContain("untested");
    expect(svg).toContain("github.com/ashutosh-rath02/atrophy");
    expect(svg).not.toContain("http://www.w3.org/1999/xhtml"); // no foreign objects / external refs
  });
});
