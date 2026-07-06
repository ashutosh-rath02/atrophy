import { exerciseSchema, type Exercise } from "../schema.js";
import { int, pick, sample, type Rng } from "../../engine/rng.js";
import { PREDICT_LIMIT_BY_TIER, rngFor, type ExerciseGenerator } from "./types.js";

/**
 * Code-reading generators render a randomized deterministic snippet; the
 * grader computes ground truth by actually running it, so variants can never
 * ship a wrong answer key.
 */

function predictExercise(
  family: string,
  language: "python" | "javascript",
  seed: string,
  tier: number,
  title: string,
  snippet: string,
): Exercise {
  const raw: unknown = {
    id: `${family}-${seed}`,
    kind: "predict-output",
    axis: "code-reading",
    language,
    tier,
    title,
    prompt: "Read the snippet. Predict its exact stdout — every line, exactly as it prints.",
    softTimeLimitSeconds: PREDICT_LIMIT_BY_TIER[tier] ?? 180,
    snippet,
  };
  return exerciseSchema.parse(raw) as Exercise;
}

/** Python aliasing vs copying: which names share the same list? */
const pyAlias: ExerciseGenerator = {
  family: "cr-py-alias",
  axis: "code-reading",
  language: "python",
  tiers: [1, 2],
  generate(seed, tier) {
    const rng = rngFor(this.family, seed, tier);
    const [a, b, c] = sample(rng, ["xs", "ys", "data", "vals", "buf"], 3) as [string, string, string];
    const base = [int(rng, 1, 9), int(rng, 1, 9)];
    const n1 = int(rng, 10, 99);
    const n2 = int(rng, 10, 99);
    const copyExpr = pick(rng, [`${a}[:]`, `list(${a})`, `${a}.copy()`]);
    const lines = [
      `${a} = ${JSON.stringify(base)}`,
      `${b} = ${a}`,
      `${b}.append(${n1})`,
      `print(len(${a}))`,
      `print(${a} is ${b})`,
      `${c} = ${copyExpr}`,
      `${c}.append(${n2})`,
      `print(${a})`,
    ];
    if (tier === 2) {
      // a second twist: mutating through the copy vs the alias
      lines.push(`${b}[0] = ${int(rng, 100, 999)}`, `print(${a}[0])`, `print(${c}[0])`);
    }
    return predictExercise(this.family, "python", seed, tier, "Two names, one list?", lines.join("\n") + "\n");
  },
};

/** Python slicing drills with randomized word and slice expressions. */
const pySlice: ExerciseGenerator = {
  family: "cr-py-slice",
  axis: "code-reading",
  language: "python",
  tiers: [1, 2],
  generate(seed, tier) {
    const rng = rngFor(this.family, seed, tier);
    const word = pick(rng, ["developer", "atrophy", "keyboard", "terminal", "baseline", "language"]);
    const i = int(rng, 1, 3);
    const j = int(rng, 4, Math.min(6, word.length - 1));
    const k = int(rng, 2, 3);
    const step = pick(rng, [2, 3]);
    const exprs = [`s[${i}:${j}]`, `s[-${k}:]`, `s[::${step}]`, `s[${i}:100]`];
    if (tier === 2) exprs.push("s[::-1]", `s[${j}:${i}]`);
    const chosen = sample(rng, exprs, tier === 1 ? 4 : 5);
    const snippet = `s = ${JSON.stringify(word)}\n` + chosen.map((e) => `print(${e})`).join("\n") + "\n";
    return predictExercise(this.family, "python", seed, tier, "Slice and dice", snippet);
  },
};

/** JS: coercion (t1), array chains (t2), closures (t3). */
const jsRead: ExerciseGenerator = {
  family: "cr-js-gen",
  axis: "code-reading",
  language: "javascript",
  tiers: [1, 2, 3],
  generate(seed, tier) {
    const rng = rngFor(this.family, seed, tier);
    let snippet: string;
    let title: string;
    if (tier === 1) {
      title = "Coercion warm-up";
      const n = int(rng, 1, 9);
      const m = int(rng, 2, 9);
      const linePool = [
        `console.log(${n} + "${m}");`,
        `console.log("${m}" - ${n});`,
        `console.log(typeof null);`,
        `console.log(Boolean(""));`,
        `console.log("${n}" + ${n});`,
        `console.log(typeof undefined);`,
        `console.log(Number(""));`,
      ];
      snippet = sample(rng, linePool, 4).join("\n") + "\n";
    } else if (tier === 2) {
      title = "Filter, map, stringify";
      const nums = Array.from({ length: 5 }, () => int(rng, 1, 9));
      const parity = pick(rng, [
        { test: "n % 2 === 1", name: "odd" },
        { test: "n % 2 === 0", name: "even" },
      ]);
      const op = pick(rng, ["n * n", `n * ${int(rng, 2, 10)}`, "n + 100"]);
      const [s0, s1] = [int(rng, 0, 1), int(rng, 2, 3)];
      snippet =
        `const nums = ${JSON.stringify(nums)};\n` +
        `const result = nums.filter((n) => ${parity.test}).map((n) => ${op});\n` +
        `console.log(JSON.stringify(result));\n` +
        `console.log(nums.length);\n` +
        `console.log(JSON.stringify(nums.slice(${s0}, ${s1})));\n`;
    } else {
      title = "Closures keep score";
      const step = int(rng, 2, 5);
      const start = int(rng, 0, 3);
      snippet =
        `function makeCounter(start, step) {\n` +
        `  let value = start;\n` +
        `  return function () {\n` +
        `    value += step;\n` +
        `    return value;\n` +
        `  };\n` +
        `}\n` +
        `const a = makeCounter(${start}, ${step});\n` +
        `const b = makeCounter(${start * 10}, ${step});\n` +
        `console.log(a());\n` +
        `console.log(a());\n` +
        `console.log(b());\n` +
        `console.log(a() + b());\n`;
    }
    return predictExercise(this.family, "javascript", seed, tier, title, snippet);
  },
};

export const codeReadingGenerators: ExerciseGenerator[] = [pyAlias, pySlice, jsRead];
