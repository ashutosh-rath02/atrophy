import { exerciseSchema, type Exercise } from "../schema.js";
import { pick, sample, type Rng } from "../../engine/rng.js";
import { CLOZE_LIMIT_BY_TIER, rngFor, type ExerciseGenerator } from "./types.js";

/**
 * API-memory cloze generator: a curated fact table (call + accepted answers)
 * rendered with randomized identifiers/data so repeats look fresh while the
 * tested fact stays hand-verified.
 */

interface ClozeFact {
  tier: 1 | 2 | 3;
  title: string;
  prompt: string;
  accepted: string[];
  /** Render the snippet; must contain ____ where the answer goes. */
  render(rng: Rng): string;
}

const WORD_POOLS = [
  ["banana", "fig", "apple", "kiwi"],
  ["delta", "io", "gamma", "mu"],
  ["stapler", "pen", "notebook"],
  ["turmeric", "salt", "cardamom"],
] as const;

const NAME_POOLS = ["items", "values", "entries", "records", "nums"] as const;

function numList(rng: Rng, n: number, min = -9, max = 99): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(min + Math.floor(rng() * (max - min + 1)));
  return out;
}

const PY_FACTS: ClozeFact[] = [
  {
    tier: 1,
    title: "Sort by length",
    prompt: "Fill the blank so the words sort shortest-to-longest.",
    accepted: ["len"],
    render: (rng) => {
      const words = sample(rng, pick(rng, WORD_POOLS), 3);
      return `words = ${JSON.stringify(words)}\nresult = sorted(words, key=____)`;
    },
  },
  {
    tier: 1,
    title: "Glue the parts",
    prompt: "Fill the blank: one str method concatenates a list with a separator.",
    accepted: ["join"],
    render: (rng) => {
      const words = sample(rng, pick(rng, WORD_POOLS), 3);
      const sep = pick(rng, ["-", ", ", "/"]);
      return `parts = ${JSON.stringify(words)}\nslug = ${JSON.stringify(sep)}.____(parts)`;
    },
  },
  {
    tier: 1,
    title: "Index while you loop",
    prompt: "Fill the blank: the builtin that yields (index, item) pairs.",
    accepted: ["enumerate"],
    render: (rng) => {
      const name = pick(rng, NAME_POOLS);
      return `for i, item in ____(${name}):\n    print(i, item)`;
    },
  },
  {
    tier: 1,
    title: "Add them all",
    prompt: "Fill the blank: one builtin totals a list of numbers.",
    accepted: ["sum"],
    render: (rng) => {
      const name = pick(rng, NAME_POOLS);
      return `${name} = ${JSON.stringify(numList(rng, 4, 1, 30))}\ntotal = ____(${name})`;
    },
  },
  {
    tier: 2,
    title: "Count without KeyError",
    prompt: "Fill the blank: the dict method that makes this safe for unseen keys.",
    accepted: ["get"],
    render: (rng) => {
      const key = pick(rng, ["word", "tag", "label"]);
      return `counts = {}\nfor ${key} in ${key}s:\n    counts[${key}] = counts.____(${key}, 0) + 1`;
    },
  },
  {
    tier: 2,
    title: "Count everything at once",
    prompt: "Fill the blank — the same collections class goes in both blanks.",
    accepted: ["Counter"],
    render: (rng) => {
      const name = pick(rng, ["words", "tags", "events"]);
      return `from collections import ____\n\ncounts = ____(${name})\nprint(counts.most_common(2))`;
    },
  },
  {
    tier: 2,
    title: "Dedupe (order doesn't matter)",
    prompt: "Fill the blank: the builtin that removes duplicates (order not required).",
    accepted: ["set"],
    render: (rng) => {
      const words = pick(rng, WORD_POOLS);
      const dup = [...sample(rng, words, 3), words[0]];
      return `names = ${JSON.stringify(dup)}\nunique = list(____(names))`;
    },
  },
  {
    tier: 2,
    title: "Pair them up",
    prompt: "Fill the blank: the builtin that pairs two lists element-by-element.",
    accepted: ["zip"],
    render: (rng) => {
      const words = sample(rng, pick(rng, WORD_POOLS), 3);
      return `keys = ${JSON.stringify(words)}\nvals = ${JSON.stringify(numList(rng, 3, 1, 9))}\npairs = list(____(keys, vals))`;
    },
  },
  {
    tier: 3,
    title: "Memoize the classic",
    prompt: "Fill the blank — the same functools decorator (the one that accepts maxsize) goes in both blanks.",
    accepted: ["lru_cache"],
    render: () =>
      `from functools import ____\n\n@____(maxsize=None)\ndef fib(n):\n    return n if n < 2 else fib(n - 1) + fib(n - 2)`,
  },
  {
    tier: 3,
    title: "All the digits",
    prompt: "Fill the blank — the same stdlib module goes in both blanks.",
    accepted: ["re"],
    render: (rng) => {
      const v = pick(rng, ["text", "line", "raw"]);
      return `import ____\n\nnumbers = ____.findall(r"\\d+", ${v})`;
    },
  },
  {
    tier: 3,
    title: "Whole file, one call",
    prompt: "Fill the blank: the pathlib method that returns a file's entire contents as str.",
    accepted: ["read_text"],
    render: (rng) => {
      const f = pick(rng, ["config", "notes", "data"]);
      return `from pathlib import Path\n\ncontent = Path("${f}.txt").____(encoding="utf-8")`;
    },
  },
];

const JS_FACTS: ClozeFact[] = [
  {
    tier: 1,
    title: "First match wins",
    prompt: "Fill the blank: the array method returning the first matching element (not its index).",
    accepted: ["find"],
    render: (rng) => {
      const nums = numList(rng, 4, -9, 9);
      return `const nums = ${JSON.stringify(nums)};\nconst firstNegative = nums.____((n) => n < 0);`;
    },
  },
  {
    tier: 1,
    title: "Transform each",
    prompt: "Fill the blank: the array method that transforms every element into a new array.",
    accepted: ["map"],
    render: (rng) => {
      const k = pick(rng, [2, 3, 10]);
      return `const nums = ${JSON.stringify(numList(rng, 4, 1, 9))};\nconst scaled = nums.____((n) => n * ${k});`;
    },
  },
  {
    tier: 1,
    title: "Keep the good ones",
    prompt: "Fill the blank: the array method that keeps only elements passing the test.",
    accepted: ["filter"],
    render: (rng) => {
      return `const nums = ${JSON.stringify(numList(rng, 5, -9, 9))};\nconst positives = nums.____((n) => n > 0);`;
    },
  },
  {
    tier: 2,
    title: "Fold to one value",
    prompt: "Fill the blank: the array method that folds everything into a single value.",
    accepted: ["reduce"],
    render: (rng) => {
      return `const nums = ${JSON.stringify(numList(rng, 4, 1, 20))};\nconst total = nums.____((acc, n) => acc + n, 0);`;
    },
  },
  {
    tier: 2,
    title: "Walk an object's pairs",
    prompt: "Fill the blank: the Object static method that yields [key, value] pairs.",
    accepted: ["entries"],
    render: (rng) => {
      const role = pick(rng, ["dev", "ops", "qa"]);
      return `const user = { name: "Asha", role: "${role}" };\nfor (const [key, value] of Object.____(user)) {\n  console.log(key, value);\n}`;
    },
  },
  {
    tier: 2,
    title: "Dedupe an array",
    prompt: "Fill the blank: the collection type that removes duplicates when spread.",
    accepted: ["Set"],
    render: (rng) => {
      const words = pick(rng, WORD_POOLS);
      const dup = [...sample(rng, words, 3), words[1]];
      return `const names = ${JSON.stringify(dup)};\nconst unique = [...new ____(names)];`;
    },
  },
  {
    tier: 2,
    title: "Any of them?",
    prompt: "Fill the blank: the array method answering \"does at least one element pass?\".",
    accepted: ["some"],
    render: (rng) => {
      const d = pick(rng, [2, 3, 5]);
      return `const nums = ${JSON.stringify(numList(rng, 4, 1, 30))};\nconst hasMultiple = nums.____((n) => n % ${d} === 0);`;
    },
  },
  {
    tier: 3,
    title: "Object from pairs",
    prompt: "Fill the blank: the Object static method that builds an object from [key, value] pairs.",
    accepted: ["fromEntries"],
    render: () => `const pairs = [["a", 1], ["b", 2]];\nconst obj = Object.____(pairs);`,
  },
  {
    tier: 3,
    title: "Wait for all of them",
    prompt: "Fill the blank: the Promise combinator that resolves when every promise resolves.",
    accepted: ["all"],
    render: (rng) => {
      const a = pick(rng, ["fetchUser", "loadConfig"]);
      return `const [user, posts] = await Promise.____([${a}(), fetchPosts()]);`;
    },
  },
  {
    tier: 3,
    title: "Pretty-print JSON",
    prompt: "Fill the blank: the JSON method that serializes with 2-space indentation.",
    accepted: ["stringify"],
    render: () => `const text = JSON.____(config, null, 2);`,
  },
];

function makeClozeGenerator(family: string, language: "python" | "javascript", facts: ClozeFact[]): ExerciseGenerator {
  const tiers = [...new Set(facts.map((f) => f.tier))].sort();
  return {
    family,
    axis: "api-memory",
    language,
    tiers,
    generate(seed, tier) {
      const rng = rngFor(family, seed, tier);
      const pool = facts.filter((f) => f.tier === tier);
      const fact = pick(rng, pool);
      const raw: unknown = {
        id: `${family}-${seed}`,
        kind: "cloze",
        axis: "api-memory",
        language,
        tier,
        title: fact.title,
        prompt: fact.prompt,
        softTimeLimitSeconds: CLOZE_LIMIT_BY_TIER[tier] ?? 90,
        snippet: fact.render(rng),
        acceptedAnswers: fact.accepted,
      };
      return exerciseSchema.parse(raw) as Exercise;
    },
  };
}

export const apiMemoryGenerators: ExerciseGenerator[] = [
  makeClozeGenerator("api-py-gen", "python", PY_FACTS),
  makeClozeGenerator("api-js-gen", "javascript", JS_FACTS),
];
