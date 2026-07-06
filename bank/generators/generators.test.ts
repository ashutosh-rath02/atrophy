import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { grade, gradePrediction, solutionFileName } from "../../engine/grader.js";
import { isCode, type CodeExercise, type PredictExercise } from "../schema.js";
import { allGenerators } from "./index.js";

const SEEDS = ["a1b2c3", "000000", "ffffff"];

const dirs: string[] = [];
function scratch(): string {
  const d = mkdtempSync(join(tmpdir(), "atrophy-gen-"));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("generator contracts", () => {
  it("every generator is deterministic and schema-valid for every tier and seed", () => {
    for (const g of allGenerators) {
      for (const tier of g.tiers) {
        for (const seed of SEEDS) {
          const a = g.generate(seed, tier); // schema-validated inside generate
          const b = g.generate(seed, tier);
          expect(b, `${g.family} t${tier} ${seed} not deterministic`).toEqual(a);
          expect(a.id).toBe(`${g.family}-${seed}`);
          expect(a.tier).toBe(tier);
          expect(a.axis).toBe(g.axis);
          expect(a.language).toBe(g.language);
        }
      }
    }
  });

  it("distinct seeds produce distinct exercises (spot check)", () => {
    for (const g of allGenerators) {
      const tier = g.tiers[0]!;
      const variants = new Set(
        ["111111", "222222", "333333", "444444", "555555"].map((s) =>
          JSON.stringify({ ...g.generate(s, tier), id: "x" }),
        ),
      );
      expect(variants.size, `${g.family}: variants collapse to one exercise`).toBeGreaterThan(1);
    }
  });

  it("debugging generators plant bugs that really fail their tests", async () => {
    const debug = allGenerators.filter((g) => g.axis === "debugging");
    expect(debug.length).toBeGreaterThan(0);
    for (const g of debug) {
      for (const [seed, tier] of [["9a8b7c", g.tiers[0]!], ["cafe01", g.tiers[g.tiers.length - 1]!]] as const) {
        const ex = g.generate(seed, tier);
        if (!isCode(ex)) throw new Error("debugging generator must produce code exercises");
        const dir = scratch();
        writeFileSync(join(dir, solutionFileName(ex)), ex.starterCode, "utf8");
        const r = await grade(ex as CodeExercise, dir);
        expect(r.passed, `${ex.id}: planted bug passes all tests`).toBeLessThan(r.total);
        expect(r.harnessError, `${ex.id}: starter should at least run`).toBeUndefined();
      }
    }
  }, 120_000);

  it("predict-output generators produce runnable, deterministic snippets", async () => {
    const predicts = allGenerators.filter((g) => g.axis === "code-reading");
    expect(predicts.length).toBeGreaterThan(0);
    for (const g of predicts) {
      for (const tier of g.tiers) {
        const ex = g.generate("0dd001", tier) as PredictExercise;
        const first = await gradePrediction(ex, scratch(), "");
        expect(first.error, `${ex.id}: ${first.error}`).toBeUndefined();
        expect(first.actual, `${ex.id}: snippet prints nothing`).toBeTruthy();
        const second = await gradePrediction(ex, scratch(), first.actual!);
        expect(second.correct, `${ex.id}: output not deterministic`).toBe(true);
      }
    }
  }, 120_000);

  it("cloze generators always include the blank", () => {
    for (const g of allGenerators.filter((x) => x.axis === "api-memory")) {
      for (const tier of g.tiers) {
        for (const seed of SEEDS) {
          const ex = g.generate(seed, tier);
          if (ex.kind !== "cloze") throw new Error("api-memory generator must produce cloze");
          expect(ex.snippet).toContain("____");
          expect(ex.acceptedAnswers.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
