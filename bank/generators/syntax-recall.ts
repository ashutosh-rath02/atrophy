import { exerciseSchema, type Exercise } from "../schema.js";
import { int, pick, type Rng } from "../../engine/rng.js";
import { SOFT_LIMIT_BY_TIER, rngFor, type ExerciseGenerator } from "./types.js";

/**
 * Syntax-recall generator: "aggregate the matching numbers" specs. The
 * expected test outputs are computed here from the same predicate/aggregate
 * the prompt describes, so prompt and tests can never disagree.
 */

interface Predicate {
  key: string;
  fn(n: number, k: number): boolean;
  phrase(k: number): string;
  pyName(k: number): string;
  jsName(k: number): string;
  /** Degenerate under the absolute-value twist (e.g. "negative"). */
  absSafe: boolean;
}

const PREDICATES: Predicate[] = [
  {
    key: "even",
    fn: (n) => n % 2 === 0,
    phrase: () => "even numbers",
    pyName: () => "evens",
    jsName: () => "Evens",
    absSafe: true,
  },
  {
    key: "odd",
    fn: (n) => Math.abs(n % 2) === 1,
    phrase: () => "odd numbers",
    pyName: () => "odds",
    jsName: () => "Odds",
    absSafe: true,
  },
  {
    key: "negative",
    fn: (n) => n < 0,
    phrase: () => "negative numbers",
    pyName: () => "negatives",
    jsName: () => "Negatives",
    absSafe: false,
  },
  {
    key: "over",
    fn: (n, k) => n > k,
    phrase: (k) => `numbers greater than ${k}`,
    pyName: (k) => `over_${k}`,
    jsName: (k) => `Over${k}`,
    absSafe: true,
  },
  {
    key: "multiple",
    fn: (n, k) => n % k === 0,
    phrase: (k) => `multiples of ${k}`,
    pyName: (k) => `multiples_of_${k}`,
    jsName: (k) => `MultiplesOf${k}`,
    absSafe: true,
  },
];

type Twist = "none" | "skip" | "abs";

function reference(
  nums: number[],
  pred: Predicate,
  k: number,
  agg: "sum" | "count",
  twist: Twist,
  skipN: number,
): number {
  let vals = twist === "skip" ? nums.slice(skipN) : [...nums];
  if (twist === "abs") vals = vals.map(Math.abs);
  const matching = vals.filter((n) => pred.fn(n, k));
  return agg === "sum" ? matching.reduce((a, b) => a + b, 0) : matching.length;
}

function randList(rng: Rng, n: number, min: number, max: number): number[] {
  return Array.from({ length: n }, () => int(rng, min, max));
}

function makeCondGenerator(family: string, language: "python" | "javascript"): ExerciseGenerator {
  return {
    family,
    axis: "syntax-recall",
    language,
    tiers: [1, 2],
    generate(seed, tier) {
      const rng = rngFor(family, seed, tier);
      const agg = pick(rng, ["sum", "count"] as const);
      const twist: Twist = tier === 1 ? "none" : pick(rng, ["skip", "abs"] as const);
      const pool = twist === "abs" ? PREDICATES.filter((p) => p.absSafe) : PREDICATES;
      const pred = pick(rng, pool);
      const k = pred.key === "over" ? int(rng, 2, 9) : pred.key === "multiple" ? int(rng, 3, 5) : 0;
      const skipN = int(rng, 1, 2);

      const fnName =
        language === "python"
          ? `${agg}_${pred.pyName(k)}`
          : `${agg}${pred.jsName(k)}`;

      const twistText =
        twist === "skip"
          ? `, ignoring the first ${skipN} element${skipN === 1 ? "" : "s"} of the list`
          : twist === "abs"
            ? ", treating every number by its absolute value"
            : "";
      const what = agg === "sum" ? `the sum of the ${pred.phrase(k)}` : `how many ${pred.phrase(k)} appear`;

      // test cases — computed from the reference, edge cases included
      const cases: number[][] = [
        randList(rng, 6, -9, 12),
        [],
        randList(rng, 4, 1, 9),
        randList(rng, 5, -12, -1),
        [0, int(rng, 1, 6), int(rng, -6, -1)],
      ];
      const tests = cases.map((args) => ({
        args: [args],
        expected: reference(args, pred, k, agg, twist, skipN),
      }));

      const ex1 = cases[0]!;
      const ex2 = cases[2]!;
      const prompt =
        `Write ${fnName}(nums) that returns ${what} in the list nums${twistText}.\n` +
        `Return 0 for an empty list or when nothing matches.\n\n` +
        `Examples:\n` +
        `  ${fnName}(${JSON.stringify(ex1)}) -> ${tests[0]!.expected}\n` +
        `  ${fnName}(${JSON.stringify(ex2)}) -> ${tests[2]!.expected}`;

      const starterCode =
        language === "python"
          ? `def ${fnName}(nums):\n    pass\n`
          : `function ${fnName}(nums) {\n  // your code\n}\n\nmodule.exports = { ${fnName} };\n`;

      const raw: unknown = {
        id: `${family}-${seed}`,
        kind: "write",
        axis: "syntax-recall",
        language,
        tier,
        title: agg === "sum" ? `Sum of ${pred.phrase(k)}` : `Count the ${pred.phrase(k)}`,
        prompt,
        functionName: fnName,
        starterCode,
        softTimeLimitSeconds: SOFT_LIMIT_BY_TIER[tier] ?? 300,
        tests,
      };
      return exerciseSchema.parse(raw) as Exercise;
    },
  };
}

export const syntaxRecallGenerators: ExerciseGenerator[] = [
  makeCondGenerator("sr-py-cond", "python"),
  makeCondGenerator("sr-js-cond", "javascript"),
];
