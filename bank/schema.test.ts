import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BankError, loadBank, parseExercise, totalUnits } from "./schema.js";

const here = fileURLToPath(new URL(".", import.meta.url));

const valid = {
  id: "sr-py-001",
  kind: "write",
  axis: "syntax-recall",
  language: "python",
  tier: 1,
  title: "t",
  prompt: "p",
  functionName: "f",
  starterCode: "def f(): pass",
  softTimeLimitSeconds: 300,
  tests: [{ args: [1], expected: 2 }],
};

describe("parseExercise", () => {
  it("accepts a valid write exercise and applies defaults", () => {
    const ex = parseExercise(JSON.stringify(valid));
    expect(ex.id).toBe("sr-py-001");
    expect(ex.testTimeoutMs).toBe(10_000); // default
  });

  it("accepts the other kinds", () => {
    expect(parseExercise(JSON.stringify({ ...valid, id: "dbg-py-001", kind: "fix", axis: "debugging" })).kind).toBe("fix");
    const predict = { id: "cr-py-001", kind: "predict-output", axis: "code-reading", language: "python", tier: 1, title: "t", prompt: "p", softTimeLimitSeconds: 120, snippet: "print(1)" };
    expect(parseExercise(JSON.stringify(predict)).kind).toBe("predict-output");
    const cloze = { id: "api-py-001", kind: "cloze", axis: "api-memory", language: "python", tier: 1, title: "t", prompt: "p", softTimeLimitSeconds: 60, snippet: "x = ____(y)", acceptedAnswers: ["len"] };
    expect(parseExercise(JSON.stringify(cloze)).kind).toBe("cloze");
    const outline = { id: "dec-any-001", kind: "outline", axis: "decomposition", language: "any", tier: 1, title: "t", prompt: "p", softTimeLimitSeconds: 420, rubric: ["a", "b"] };
    expect(parseExercise(JSON.stringify(outline)).kind).toBe("outline");
  });

  it("rejects malformed JSON with the source name", () => {
    expect(() => parseExercise("{nope", "bank/x.json")).toThrowError(/bank\/x\.json.*invalid JSON/s);
  });

  it.each([
    ["bad id", { ...valid, id: "WeirdId!" }],
    ["unknown kind", { ...valid, kind: "vibes" }],
    ["missing kind", { ...valid, kind: undefined }],
    ["unknown axis", { ...valid, axis: "vibes" }],
    ["unknown language", { ...valid, language: "rust" }],
    ["tier out of range", { ...valid, tier: 4 }],
    ["empty tests", { ...valid, tests: [] }],
    ["missing prompt", { ...valid, prompt: undefined }],
    ["cloze without acceptedAnswers", { id: "api-py-002", kind: "cloze", axis: "api-memory", language: "python", tier: 1, title: "t", prompt: "p", softTimeLimitSeconds: 60, snippet: "____" }],
    ["outline with a concrete language", { id: "dec-any-002", kind: "outline", axis: "decomposition", language: "python", tier: 1, title: "t", prompt: "p", softTimeLimitSeconds: 420, rubric: ["a"] }],
    ["predict-output without snippet", { id: "cr-py-002", kind: "predict-output", axis: "code-reading", language: "python", tier: 1, title: "t", prompt: "p", softTimeLimitSeconds: 120 }],
  ])("rejects %s", (_name, bad) => {
    expect(() => parseExercise(JSON.stringify(bad))).toThrow(BankError);
  });
});

describe("totalUnits", () => {
  it("counts tests, single answers, and rubric points", () => {
    expect(totalUnits(parseExercise(JSON.stringify(valid)))).toBe(1);
    const outline = { id: "dec-any-001", kind: "outline", axis: "decomposition", language: "any", tier: 1, title: "t", prompt: "p", softTimeLimitSeconds: 420, rubric: ["a", "b", "c"] };
    expect(totalUnits(parseExercise(JSON.stringify(outline)))).toBe(3);
    const cloze = { id: "api-py-001", kind: "cloze", axis: "api-memory", language: "python", tier: 1, title: "t", prompt: "p", softTimeLimitSeconds: 60, snippet: "____", acceptedAnswers: ["len"] };
    expect(totalUnits(parseExercise(JSON.stringify(cloze)))).toBe(1);
  });
});

describe("loadBank", () => {
  it("loads every shipped seed exercise (bank stays valid)", () => {
    const bank = loadBank(join(here, "exercises"));
    expect(bank.length).toBeGreaterThanOrEqual(6);
    const ids = bank.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
