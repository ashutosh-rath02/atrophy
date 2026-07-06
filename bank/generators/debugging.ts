import { exerciseSchema, type Exercise } from "../schema.js";
import { int, pick, sample, type Rng } from "../../engine/rng.js";
import { SOFT_LIMIT_BY_TIER, rngFor, type ExerciseGenerator } from "./types.js";

/**
 * Debugging generator: a correct "sum amounts per category" implementation
 * with ONE randomly planted mutation. Both the correct and the buggy
 * semantics are simulated here in TypeScript, and the generator throws if
 * the planted bug wouldn't fail at least one generated test — a variant
 * with an invisible bug cannot exist by construction.
 */

type Pair = [string, number];
type Mutation = "overwrite" | "count" | "reset" | "nolower";

const CATEGORIES = ["food", "rent", "travel", "tools", "books", "gear"] as const;

function refTotals(pairs: Pair[], lower: boolean): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [cat, amount] of pairs) {
    const k = lower ? cat.toLowerCase() : cat;
    totals[k] = (totals[k] ?? 0) + amount;
  }
  return totals;
}

/** Simulate what each planted bug would return. */
function buggyTotals(pairs: Pair[], mutation: Mutation, lower: boolean): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [cat, amount] of pairs) {
    const k = mutation === "nolower" ? cat : lower ? cat.toLowerCase() : cat;
    if (mutation === "reset") {
      for (const key of Object.keys(totals)) delete totals[key];
    }
    if (mutation === "overwrite") totals[k] = amount;
    else if (mutation === "count") totals[k] = (totals[k] ?? 0) + 1;
    else totals[k] = (totals[k] ?? 0) + amount;
  }
  return totals;
}

const canon = (v: unknown) => JSON.stringify(v, Object.keys(v as object).sort());

function renderPython(mutation: Mutation, lower: boolean): string {
  const keyExpr = lower && mutation !== "nolower" ? "category.lower()" : "category";
  const assign =
    mutation === "overwrite"
      ? `        totals[${keyExpr}] = amount`
      : mutation === "count"
        ? `        totals[${keyExpr}] = totals.get(${keyExpr}, 0) + 1`
        : `        totals[${keyExpr}] = totals.get(${keyExpr}, 0) + amount`;
  const reset = mutation === "reset" ? "        totals = {}\n" : "";
  return `def total_by_category(pairs):\n    totals = {}\n    for category, amount in pairs:\n${reset}${assign}\n    return totals\n`;
}

function renderJs(mutation: Mutation, lower: boolean): string {
  const keyExpr = lower && mutation !== "nolower" ? "category.toLowerCase()" : "category";
  const assign =
    mutation === "overwrite"
      ? `    totals[${keyExpr}] = amount;`
      : mutation === "count"
        ? `    totals[${keyExpr}] = (totals[${keyExpr}] || 0) + 1;`
        : `    totals[${keyExpr}] = (totals[${keyExpr}] || 0) + amount;`;
  const reset = mutation === "reset" ? "    totals = {};\n" : "";
  return (
    `function totalByCategory(pairs) {\n  let totals = {};\n  for (const [category, amount] of pairs) {\n` +
    reset +
    assign +
    `\n  }\n  return totals;\n}\n\nmodule.exports = { totalByCategory };\n`
  );
}

function titleCase(cat: string): string {
  return cat[0]!.toUpperCase() + cat.slice(1);
}

function makeDebugGenerator(family: string, language: "python" | "javascript"): ExerciseGenerator {
  return {
    family,
    axis: "debugging",
    language,
    tiers: [1, 2],
    generate(seed, tier) {
      const rng = rngFor(family, seed, tier);
      const lower = tier === 2;
      const mutation: Mutation = lower
        ? pick(rng, ["overwrite", "count", "reset", "nolower"] as const)
        : pick(rng, ["overwrite", "count", "reset"] as const);

      // Data that provably exposes every mutation: a repeated category with
      // distinct amounts >= 2, plus (tier 2) a mixed-case duplicate.
      const cats = sample(rng, CATEGORIES, 3);
      const rep = cats[0]!;
      const a1 = int(rng, 2, 49);
      const a2 = a1 + int(rng, 2, 40);
      const mainCase: Pair[] = [
        [rep, a1],
        [cats[1]!, int(rng, 2, 99)],
        [lower ? titleCase(rep) : rep, a2],
        [cats[2]!, int(rng, 2, 99)],
      ];
      const cases: Pair[][] = [
        mainCase,
        [],
        [[cats[1]!, int(rng, 2, 99)]],
        [
          [cats[2]!, int(rng, 2, 30)],
          [cats[2]!, int(rng, 31, 60)],
        ],
      ];
      const tests = cases.map((pairs) => ({
        args: [pairs],
        expected: refTotals(pairs, lower),
      }));

      // Construction-time guarantee: the planted bug must be visible.
      const exposed = cases.some(
        (pairs) => canon(buggyTotals(pairs, mutation, lower)) !== canon(refTotals(pairs, lower)),
      );
      if (!exposed) {
        throw new Error(`${family}-${seed}: mutation ${mutation} not exposed by generated tests`);
      }

      const fnName = language === "python" ? "total_by_category" : "totalByCategory";
      const lowerText = lower
        ? " Category names are case-insensitive — keys in the result must be lowercase."
        : "";
      const raw: unknown = {
        id: `${family}-${seed}`,
        kind: "fix",
        axis: "debugging",
        language,
        tier,
        title: "The totals are wrong",
        prompt:
          `${fnName}(pairs) receives [category, amount] pairs and should return a ` +
          `${language === "python" ? "dict" : "object"} mapping each category to the SUM of its amounts.${lowerText}\n` +
          `Users report wrong totals. Find and fix the bug — smallest change wins, don't rewrite from scratch.`,
        functionName: fnName,
        starterCode: language === "python" ? renderPython(mutation, lower) : renderJs(mutation, lower),
        softTimeLimitSeconds: SOFT_LIMIT_BY_TIER[tier] ?? 300,
        tests,
      };
      return exerciseSchema.parse(raw) as Exercise;
    },
  };
}

export const debuggingGenerators: ExerciseGenerator[] = [
  makeDebugGenerator("dbg-py-agg", "python"),
  makeDebugGenerator("dbg-js-agg", "javascript"),
];
