import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ClozeExercise,
  CodeExercise,
  OutlineExercise,
  PredictExercise,
} from "../bank/schema.js";
import { run } from "./runner.js";

export interface TestFailure {
  index: number;
  args: unknown[];
  expected: unknown;
  actual?: unknown;
  error?: string;
}

export interface GradeResult {
  passed: number;
  total: number;
  failures: TestFailure[];
  /** Harness crashed / didn't produce a result (syntax error, timeout, ...). */
  harnessError?: string;
}

const RESULT_MARKER = "ATROPHY_RESULT ";

export function solutionFileName(ex: CodeExercise | OutlineExercise): string {
  if (ex.kind === "outline") return "outline.md";
  return ex.language === "python" ? "solution.py" : "solution.js";
}

export function pythonCommand(): string {
  if (process.env.ATROPHY_PYTHON) return process.env.ATROPHY_PYTHON;
  return process.platform === "win32" ? "python" : "python3";
}

function pythonHarness(ex: CodeExercise): string {
  const tests = JSON.stringify(ex.tests);
  return `import importlib.util, json, sys, traceback

spec = importlib.util.spec_from_file_location("solution", "solution.py")
mod = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(mod)
    fn = getattr(mod, ${JSON.stringify(ex.functionName)})
except Exception:
    print("ATROPHY_RESULT " + json.dumps({
        "passed": 0, "total": ${ex.tests.length},
        "failures": [{"index": -1, "args": [], "expected": None,
                      "error": traceback.format_exc(limit=3)}]
    }))
    sys.exit(0)

tests = json.loads(${JSON.stringify(tests)})
def canon(v):
    return json.dumps(v, sort_keys=True, default=str)

failures = []
passed = 0
for i, t in enumerate(tests):
    try:
        actual = fn(*t["args"])
        actual = json.loads(json.dumps(actual, default=str))  # tuples -> lists etc.
        if canon(actual) == canon(t["expected"]):
            passed += 1
        else:
            failures.append({"index": i, "args": t["args"],
                             "expected": t["expected"], "actual": actual})
    except Exception:
        failures.append({"index": i, "args": t["args"], "expected": t["expected"],
                         "error": traceback.format_exc(limit=2)})

print("ATROPHY_RESULT " + json.dumps({"passed": passed, "total": len(tests),
                                      "failures": failures}))
`;
}

function nodeHarness(ex: CodeExercise): string {
  const tests = JSON.stringify(ex.tests);
  return `const path = require("node:path");
let fn;
const total = ${ex.tests.length};
const emit = (r) => console.log("ATROPHY_RESULT " + JSON.stringify(r));
try {
  const mod = require(path.join(__dirname, "solution.js"));
  fn = mod[${JSON.stringify(ex.functionName)}];
  if (typeof fn !== "function") {
    throw new Error(${JSON.stringify(ex.functionName)} + " is not exported (keep the module.exports line)");
  }
} catch (err) {
  emit({ passed: 0, total, failures: [{ index: -1, args: [], expected: null, error: String(err && err.stack || err) }] });
  process.exit(0);
}

const tests = JSON.parse(${JSON.stringify(tests)});
const canon = (v) => JSON.stringify(sortKeys(v));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.keys(v).sort().reduce((acc, k) => { acc[k] = sortKeys(v[k]); return acc; }, {});
  }
  return v;
}

let passed = 0;
const failures = [];
tests.forEach((t, i) => {
  try {
    let actual = fn(...t.args);
    actual = actual === undefined ? null : JSON.parse(JSON.stringify(actual));
    if (canon(actual) === canon(t.expected)) passed += 1;
    else failures.push({ index: i, args: t.args, expected: t.expected, actual });
  } catch (err) {
    failures.push({ index: i, args: t.args, expected: t.expected, error: String(err && err.stack || err).split("\\n").slice(0, 3).join("\\n") });
  }
});
emit({ passed, total, failures });
`;
}

/**
 * Grade the solution file sitting in `dir` against the exercise's hidden tests.
 * Writes the language harness next to it and runs it in a subprocess.
 */
export async function grade(ex: CodeExercise, dir: string): Promise<GradeResult> {
  const isPy = ex.language === "python";
  const harnessName = isPy ? "__atrophy_harness__.py" : "__atrophy_harness__.cjs";
  writeFileSync(join(dir, harnessName), isPy ? pythonHarness(ex) : nodeHarness(ex), "utf8");

  const cmd = isPy ? pythonCommand() : process.execPath;
  let result;
  try {
    result = await run(cmd, [harnessName], { cwd: dir, timeoutMs: ex.testTimeoutMs });
  } catch (err) {
    return {
      passed: 0,
      total: ex.tests.length,
      failures: [],
      harnessError: `could not start ${cmd}: ${(err as Error).message}`,
    };
  }

  if (result.timedOut) {
    return {
      passed: 0,
      total: ex.tests.length,
      failures: [],
      harnessError: `tests timed out after ${ex.testTimeoutMs} ms (infinite loop?)`,
    };
  }

  const line = result.stdout
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.startsWith(RESULT_MARKER));
  if (!line) {
    const detail = (result.stderr || result.stdout).trim().slice(0, 2000);
    return {
      passed: 0,
      total: ex.tests.length,
      failures: [],
      harnessError: detail || `harness produced no result (exit ${result.exitCode})`,
    };
  }
  return JSON.parse(line.slice(RESULT_MARKER.length)) as GradeResult;
}

/** Canonicalize program output: CRLF→LF, strip per-line trailing space + outer blank lines. */
export function normalizeOutput(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();
}

export interface PredictionResult {
  correct: boolean;
  /** The snippet's real stdout (ground truth), when it ran cleanly. */
  actual?: string;
  /** The snippet itself failed to run — a bank bug, not a user mistake. */
  error?: string;
}

/**
 * Grade a code-reading prediction: run the snippet for ground truth and
 * compare normalized stdout. Nothing to hand-maintain, nothing to drift.
 */
export async function gradePrediction(
  ex: PredictExercise,
  dir: string,
  prediction: string,
): Promise<PredictionResult> {
  const isPy = ex.language === "python";
  const file = isPy ? "snippet.py" : "snippet.js";
  writeFileSync(join(dir, file), ex.snippet, "utf8");
  const cmd = isPy ? pythonCommand() : process.execPath;
  let result;
  try {
    result = await run(cmd, [file], { cwd: dir, timeoutMs: ex.testTimeoutMs });
  } catch (err) {
    return { correct: false, error: `could not start ${cmd}: ${(err as Error).message}` };
  }
  if (result.timedOut || result.exitCode !== 0) {
    const detail = result.timedOut ? "timed out" : result.stderr.trim().slice(0, 500);
    return { correct: false, error: `snippet failed to run (${detail}) — please report this exercise` };
  }
  const actual = normalizeOutput(result.stdout);
  return { correct: actual === normalizeOutput(prediction), actual };
}

/** Trim + collapse inner whitespace; cloze answers stay case-sensitive (API names are). */
export function normalizeClozeAnswer(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export function gradeCloze(ex: ClozeExercise, answer: string): boolean {
  const norm = normalizeClozeAnswer(answer);
  return ex.acceptedAnswers.some((a) => normalizeClozeAnswer(a) === norm);
}
