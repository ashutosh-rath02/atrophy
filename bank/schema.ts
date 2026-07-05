import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const AXES = [
  "syntax-recall",
  "debugging",
  "code-reading",
  "api-memory",
  "decomposition",
] as const;

export const LANGUAGES = ["python", "javascript"] as const;

export const testCaseSchema = z.object({
  /** Arguments passed to the exercise function, JSON-encodable. */
  args: z.array(z.unknown()),
  /** Expected return value, compared by canonical JSON equality. */
  expected: z.unknown(),
});

export const exerciseSchema = z.object({
  id: z.string().regex(/^[a-z]+-[a-z]+-\d{3}$/, "id must look like sr-py-001"),
  axis: z.enum(AXES),
  language: z.enum(LANGUAGES),
  /** Difficulty tier: 1 (easy) to 3 (hard). */
  tier: z.number().int().min(1).max(3),
  title: z.string().min(1),
  /** Shown to the user before the drill starts. */
  prompt: z.string().min(1),
  /** Name of the function the harness will call. */
  functionName: z.string().min(1),
  /** Written into the solution file the user edits. */
  starterCode: z.string().min(1),
  /** Soft limit in seconds; going over shrinks the score, never blocks. */
  softTimeLimitSeconds: z.number().int().positive(),
  /** Hard timeout for one grading run of the hidden tests. */
  testTimeoutMs: z.number().int().positive().default(10_000),
  tests: z.array(testCaseSchema).min(1),
});

export type Exercise = z.infer<typeof exerciseSchema>;
export type Axis = (typeof AXES)[number];
export type Language = (typeof LANGUAGES)[number];

export class BankError extends Error {}

/** Parse and validate a single exercise JSON string. */
export function parseExercise(json: string, source = "<inline>"): Exercise {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    throw new BankError(`${source}: invalid JSON: ${(err as Error).message}`);
  }
  const result = exerciseSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new BankError(`${source}: invalid exercise: ${issues}`);
  }
  return result.data;
}

/** Recursively load every *.json exercise under a bank directory. */
export function loadBank(dir: string): Exercise[] {
  const exercises: Exercise[] = [];
  const seen = new Set<string>();
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".json")) {
        const ex = parseExercise(readFileSync(full, "utf8"), full);
        if (seen.has(ex.id)) throw new BankError(`duplicate exercise id: ${ex.id}`);
        seen.add(ex.id);
        exercises.push(ex);
      }
    }
  };
  walk(dir);
  return exercises;
}
