import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BankError, loadBank, parseExercise } from "./schema.js";

const here = fileURLToPath(new URL(".", import.meta.url));

const valid = {
  id: "sr-py-001",
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
  it("accepts a valid exercise and applies defaults", () => {
    const ex = parseExercise(JSON.stringify(valid));
    expect(ex.id).toBe("sr-py-001");
    expect(ex.testTimeoutMs).toBe(10_000); // default
  });

  it("rejects malformed JSON with the source name", () => {
    expect(() => parseExercise("{nope", "bank/x.json")).toThrowError(/bank\/x\.json.*invalid JSON/s);
  });

  it.each([
    ["bad id", { ...valid, id: "WeirdId!" }],
    ["unknown axis", { ...valid, axis: "vibes" }],
    ["unknown language", { ...valid, language: "rust" }],
    ["tier out of range", { ...valid, tier: 4 }],
    ["empty tests", { ...valid, tests: [] }],
    ["missing prompt", { ...valid, prompt: undefined }],
  ])("rejects %s", (_name, bad) => {
    expect(() => parseExercise(JSON.stringify(bad))).toThrow(BankError);
  });
});

describe("loadBank", () => {
  it("loads every shipped seed exercise (bank stays valid)", () => {
    const bank = loadBank(join(here, "exercises"));
    expect(bank.length).toBeGreaterThanOrEqual(6);
    const ids = bank.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(bank.every((e) => e.axis === "syntax-recall")).toBe(true);
  });
});
