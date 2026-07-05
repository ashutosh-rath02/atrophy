import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ClozeExercise, CodeExercise, PredictExercise } from "../bank/schema.js";
import {
  grade,
  gradeCloze,
  gradePrediction,
  normalizeClozeAnswer,
  normalizeOutput,
  solutionFileName,
} from "./grader.js";

const dirs: string[] = [];
function scratch(): string {
  const d = mkdtempSync(join(tmpdir(), "atrophy-test-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const pyEx: CodeExercise = {
  id: "sr-py-901",
  kind: "write",
  axis: "syntax-recall",
  language: "python",
  tier: 1,
  title: "double",
  prompt: "double it",
  functionName: "double",
  starterCode: "def double(x):\n    pass\n",
  softTimeLimitSeconds: 300,
  testTimeoutMs: 15_000,
  tests: [
    { args: [2], expected: 4 },
    { args: [-1], expected: -2 },
    { args: [0], expected: 0 },
  ],
};

const jsEx: CodeExercise = {
  ...pyEx,
  id: "sr-js-901",
  language: "javascript",
  starterCode: "function double(x) {}\nmodule.exports = { double };\n",
};

function writeSolution(dir: string, ex: CodeExercise, code: string): void {
  writeFileSync(join(dir, solutionFileName(ex)), code, "utf8");
}

describe("grade — python", () => {
  it("passes a correct solution", async () => {
    const dir = scratch();
    writeSolution(dir, pyEx, "def double(x):\n    return x * 2\n");
    const r = await grade(pyEx, dir);
    expect(r.harnessError).toBeUndefined();
    expect(r.passed).toBe(3);
    expect(r.total).toBe(3);
  });

  it("reports per-test failures with expected vs actual", async () => {
    const dir = scratch();
    writeSolution(dir, pyEx, "def double(x):\n    return x + 2\n");
    const r = await grade(pyEx, dir);
    expect(r.passed).toBe(1); // only x=2 works
    expect(r.failures.length).toBe(2);
    expect(r.failures[0]?.expected).toBe(-2);
    expect(r.failures[0]?.actual).toBe(1);
  });

  it("surfaces syntax errors as a load failure, not a crash", async () => {
    const dir = scratch();
    writeSolution(dir, pyEx, "def double(x)\n    return x\n");
    const r = await grade(pyEx, dir);
    expect(r.passed).toBe(0);
    expect(r.failures[0]?.index).toBe(-1);
    expect(r.failures[0]?.error).toMatch(/SyntaxError/);
  });

  it("kills infinite loops via the hard timeout", async () => {
    const dir = scratch();
    writeSolution(dir, pyEx, "def double(x):\n    while True:\n        pass\n");
    const fast = { ...pyEx, testTimeoutMs: 3000 };
    const r = await grade(fast, dir);
    expect(r.passed).toBe(0);
    expect(r.harnessError).toMatch(/timed out/);
  }, 20_000);
});

describe("grade — javascript", () => {
  it("passes a correct solution", async () => {
    const dir = scratch();
    writeSolution(dir, jsEx, "function double(x) { return x * 2; }\nmodule.exports = { double };\n");
    const r = await grade(jsEx, dir);
    expect(r.harnessError).toBeUndefined();
    expect(r.passed).toBe(3);
  });

  it("fails helpfully when the export is missing", async () => {
    const dir = scratch();
    writeSolution(dir, jsEx, "function double(x) { return x * 2; }\n");
    const r = await grade(jsEx, dir);
    expect(r.passed).toBe(0);
    expect(r.failures[0]?.error).toMatch(/not exported/);
  });

  it("compares objects with key order insensitivity", async () => {
    const dir = scratch();
    const ex: CodeExercise = {
      ...jsEx,
      id: "sr-js-902",
      functionName: "make",
      tests: [{ args: [], expected: { a: 1, b: 2 } }],
      starterCode: "x",
    };
    writeSolution(dir, ex, "function make() { return { b: 2, a: 1 }; }\nmodule.exports = { make };\n");
    const r = await grade(ex, dir);
    expect(r.passed).toBe(1);
  });
});

describe("normalizeOutput", () => {
  it("ignores CRLF, trailing spaces, and outer blank lines", () => {
    expect(normalizeOutput("a \r\nb\r\n\r\n")).toBe("a\nb");
    expect(normalizeOutput("\n\na\nb")).toBe("a\nb");
  });
  it("keeps inner blank lines and case", () => {
    expect(normalizeOutput("a\n\nB")).toBe("a\n\nB");
  });
});

const predictPy: PredictExercise = {
  id: "cr-py-901",
  kind: "predict-output",
  axis: "code-reading",
  language: "python",
  tier: 1,
  title: "aliasing",
  prompt: "what does this print?",
  softTimeLimitSeconds: 120,
  testTimeoutMs: 15_000,
  snippet: 'a = [1, 2]\nb = a\nb.append(3)\nprint(len(a))\nprint(a is b)\n',
};

describe("gradePrediction", () => {
  it("accepts a correct prediction (python ground truth)", async () => {
    const r = await gradePrediction(predictPy, scratch(), "3\nTrue\n");
    expect(r.error).toBeUndefined();
    expect(r.correct).toBe(true);
    expect(r.actual).toBe("3\nTrue");
  });

  it("rejects a wrong prediction and returns the real output", async () => {
    const r = await gradePrediction(predictPy, scratch(), "2\nFalse");
    expect(r.correct).toBe(false);
    expect(r.actual).toBe("3\nTrue");
  });

  it("runs javascript snippets via node", async () => {
    const ex: PredictExercise = {
      ...predictPy,
      id: "cr-js-901",
      language: "javascript",
      snippet: 'console.log(1 + "2");\nconsole.log(typeof null);\n',
    };
    const r = await gradePrediction(ex, scratch(), "12\nobject");
    expect(r.correct).toBe(true);
  });

  it("flags a broken snippet as a bank error, not a user failure", async () => {
    const ex: PredictExercise = { ...predictPy, id: "cr-py-902", snippet: "print(undefined_name)\n" };
    const r = await gradePrediction(ex, scratch(), "anything");
    expect(r.correct).toBe(false);
    expect(r.error).toMatch(/snippet failed/);
  });
});

const clozeEx: ClozeExercise = {
  id: "api-py-901",
  kind: "cloze",
  axis: "api-memory",
  language: "python",
  tier: 1,
  title: "sort by length",
  prompt: "fill the blank",
  softTimeLimitSeconds: 60,
  testTimeoutMs: 10_000,
  snippet: "sorted(words, key=____)",
  acceptedAnswers: ["len"],
};

describe("gradeCloze", () => {
  it("matches accepted answers, whitespace-insensitively", () => {
    expect(gradeCloze(clozeEx, "len")).toBe(true);
    expect(gradeCloze(clozeEx, "  len ")).toBe(true);
    expect(gradeCloze(clozeEx, "size")).toBe(false);
  });
  it("stays case-sensitive (API names are)", () => {
    expect(gradeCloze(clozeEx, "LEN")).toBe(false);
  });
  it("collapses internal whitespace runs", () => {
    expect(normalizeClozeAnswer("lambda  w:  len(w)")).toBe("lambda w: len(w)");
  });
});
