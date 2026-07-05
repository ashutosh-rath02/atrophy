import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import pc from "picocolors";
import type { Exercise } from "../bank/schema.js";
import { grade, solutionFileName, type GradeResult } from "./grader.js";
import { exerciseScore } from "./scoring.js";

export interface DrillOutcome {
  exercise: Exercise;
  passed: number;
  total: number;
  elapsedSeconds: number;
  score: number;
  abandoned: boolean;
}

const LOCKFILE_TEXT = `This directory is an Atrophy drill in progress.

AI OFF, honor system: no Copilot, no chat models, no AI autocomplete.
The whole point is measuring what YOU can do unaided. Search engines and
official docs are fine; generated code is not.
`;

function commentPrefix(ex: Exercise): string {
  return ex.language === "python" ? "#" : "//";
}

function buildSolutionFile(ex: Exercise): string {
  const c = commentPrefix(ex);
  const promptLines = ex.prompt
    .trim()
    .split("\n")
    .map((l) => `${c} ${l}`.trimEnd())
    .join("\n");
  return `${c} ${ex.title}  [${ex.axis} / tier ${ex.tier} / ${ex.language}]
${c}
${promptLines}
${c}
${c} Soft time limit: ${Math.round(ex.softTimeLimitSeconds / 60)} min (going over shrinks the score, nothing explodes).

${ex.starterCode.trim()}
`;
}

function openEditor(file: string): boolean {
  const editor =
    process.env.ATROPHY_EDITOR || process.env.VISUAL || process.env.EDITOR;
  if (!editor) return false;
  // Fire and forget: the drill timer runs while the user edits.
  const child = spawn(editor, [file], {
    stdio: "ignore",
    detached: true,
    shell: true,
  });
  child.on("error", () => {});
  child.unref();
  return true;
}

function printFailures(result: GradeResult): void {
  if (result.harnessError) {
    console.log(pc.red("\nYour code did not run:"));
    console.log(pc.dim(result.harnessError));
    return;
  }
  for (const f of result.failures.slice(0, 3)) {
    if (f.index === -1) {
      console.log(pc.red("\nCould not load your solution:"));
      console.log(pc.dim(f.error ?? "unknown error"));
      continue;
    }
    console.log(pc.red(`\n✗ test #${f.index + 1}`) + pc.dim(`  args: ${JSON.stringify(f.args)}`));
    console.log(`  expected: ${JSON.stringify(f.expected)}`);
    if (f.error) console.log(pc.dim(`  raised:   ${f.error.split("\n").pop()}`));
    else console.log(`  got:      ${JSON.stringify(f.actual)}`);
  }
  const hidden = result.failures.length - Math.min(3, result.failures.length);
  if (hidden > 0) console.log(pc.dim(`  …and ${hidden} more failing test(s)`));
}

/**
 * Run one interactive drill: temp dir + lockfile, open $EDITOR, wait for
 * submit, grade, offer retries. Returns the final outcome (PLAN §3.1, §4).
 *
 * `solutionOverride` grades a pre-written file instead of going interactive —
 * used for scripting and end-to-end tests.
 */
export async function runDrill(
  ex: Exercise,
  solutionOverride?: string,
): Promise<DrillOutcome> {
  const dir = mkdtempSync(join(tmpdir(), "atrophy-"));
  const file = join(dir, solutionFileName(ex));
  writeFileSync(join(dir, "AI-OFF.lock"), LOCKFILE_TEXT, "utf8");
  writeFileSync(file, buildSolutionFile(ex), "utf8");

  const started = Date.now();
  const elapsed = () => (Date.now() - started) / 1000;

  try {
    if (solutionOverride) {
      copyFileSync(solutionOverride, file);
      const result = await grade(ex, dir);
      const passed = result.harnessError ? 0 : result.passed;
      const score = exerciseScore(passed, result.total, elapsed(), ex.softTimeLimitSeconds);
      return { exercise: ex, passed, total: result.total, elapsedSeconds: elapsed(), score, abandoned: false };
    }

    console.log(pc.bold(`\n${ex.title}`) + pc.dim(`  [${ex.language} · tier ${ex.tier}]`));
    console.log(pc.dim("─".repeat(60)));
    console.log(ex.prompt.trim());
    console.log(pc.dim("─".repeat(60)));
    console.log(`Edit: ${pc.cyan(file)}`);
    if (!openEditor(file)) {
      console.log(pc.dim("(set $EDITOR / $ATROPHY_EDITOR to auto-open next time)"));
    }
    console.log(
      pc.yellow(`\nAI off. `) +
        `Soft limit ${Math.round(ex.softTimeLimitSeconds / 60)} min — timer started.`,
    );

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      for (;;) {
        const answer = (
          await rl.question(pc.bold("\n[Enter] submit · [q] abandon > "))
        ).trim().toLowerCase();
        if (answer === "q") {
          return { exercise: ex, passed: 0, total: ex.tests.length, elapsedSeconds: elapsed(), score: 0, abandoned: true };
        }
        const result = await grade(ex, dir);
        const passed = result.harnessError ? 0 : result.passed;
        if (passed === result.total) {
          const score = exerciseScore(passed, result.total, elapsed(), ex.softTimeLimitSeconds);
          console.log(pc.green(`\n✓ ${passed}/${result.total} tests passed`) + pc.dim(` in ${Math.round(elapsed())}s`));
          return { exercise: ex, passed, total: result.total, elapsedSeconds: elapsed(), score, abandoned: false };
        }
        console.log(pc.red(`\n${passed}/${result.total} tests passed.`));
        printFailures(result);
        const again = (
          await rl.question(pc.bold("\n[Enter] fix & resubmit · [s] stop here · [q] abandon > "))
        ).trim().toLowerCase();
        if (again === "q") {
          return { exercise: ex, passed: 0, total: result.total, elapsedSeconds: elapsed(), score: 0, abandoned: true };
        }
        if (again === "s") {
          const score = exerciseScore(passed, result.total, elapsed(), ex.softTimeLimitSeconds);
          return { exercise: ex, passed, total: result.total, elapsedSeconds: elapsed(), score, abandoned: false };
        }
      }
    } finally {
      rl.close();
    }
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* temp cleanup is best-effort */
    }
  }
}
