#!/usr/bin/env node
import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pc from "picocolors";
import { allGenerators } from "../bank/generators/index.js";
import { AXES, loadBank, type Axis, type Exercise, type Language } from "../bank/schema.js";
import { buildPayload, startServer } from "./serve.js";
import { publishCommand } from "./publish.js";
import { selectExercise } from "../engine/select.js";
import { runDrill } from "../engine/session.js";
import {
  freshness,
  nextTier,
  updateRating,
  type Freshness,
  type RatingState,
} from "../engine/scoring.js";
import { Store } from "../store/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function bankDir(): string {
  if (process.env.ATROPHY_BANK) return process.env.ATROPHY_BANK;
  const candidates = [
    join(__dirname, "..", "bank", "exercises"), // tsx dev: cli/../bank
    join(__dirname, "..", "..", "bank", "exercises"), // built: dist/cli/../../bank
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error("exercise bank not found — set ATROPHY_BANK");
  return found;
}

interface DrillFlags {
  axis?: string;
  lang?: string;
  solution?: string;
  aiOn?: boolean;
}

function parseAxis(value: string): Axis {
  if (!(AXES as readonly string[]).includes(value)) {
    console.error(pc.red(`unknown axis "${value}" — one of: ${AXES.join(", ")}`));
    process.exit(1);
  }
  return value as Axis;
}

/** The axis most in need of a rep: never-tested first, then stalest. */
function dueAxis(store: Store, bank: Exercise[]): Axis {
  const available = AXES.filter((a) => bank.some((ex) => ex.axis === a));
  let best: Axis = available[0] ?? "syntax-recall";
  let bestTime = Infinity;
  for (const a of available) {
    const r = store.getRating(a);
    const t = r.updatedAt ? Date.parse(r.updatedAt) : -1;
    if (t < bestTime) {
      bestTime = t;
      best = a;
    }
  }
  return best;
}

async function drillOnce(store: Store, flags: DrillFlags): Promise<boolean> {
  const bank = loadBank(bankDir());
  const axis = flags.axis ? parseAxis(flags.axis) : dueAxis(store, bank);
  const language = flags.lang as Language | undefined;
  const mode = flags.aiOn ? "ai-on" : "ai-off";

  const current = store.getRating(axis);
  const recent = store.recentSessions(axis, 6).map((s) => s.exercise_id);
  const ex = selectExercise({
    statics: bank,
    generators: allGenerators,
    axis,
    rating: current.rating,
    recentIds: recent,
    language,
  });
  if (!ex) {
    console.error(pc.red(`no exercises in the bank for axis "${axis}"${flags.lang ? ` (${flags.lang})` : ""} yet`));
    return false;
  }

  const outcome = await runDrill(ex, flags.solution);
  if (outcome.abandoned) {
    console.log(pc.dim("\nAbandoned — nothing recorded. The rep only counts if you take it."));
    return true;
  }

  // AI-on sessions are recorded for the divergence chart but never touch the
  // unaided rating (PLAN §3.1 — the killer chart is the gap).
  let after: RatingState = current;
  if (mode === "ai-off") {
    after = updateRating(current, ex.tier, outcome.score);
    const lastScores = [outcome.score, ...store.recentSessions(axis, 1).map((s) => s.score)];
    const tier = nextTier(current.tier, lastScores);
    store.saveRating(axis, after, tier);
    if (tier > current.tier) console.log(pc.magenta(`\n▲ promoted to tier ${tier}`));
    if (tier < current.tier) console.log(pc.dim(`\n▼ dropped back to tier ${tier}`));
  }

  store.recordSession({
    ts: new Date().toISOString(),
    exercise_id: ex.id,
    axis,
    language: ex.language,
    tier: ex.tier,
    mode,
    passed: outcome.passed,
    total: outcome.total,
    elapsed_seconds: outcome.elapsedSeconds,
    score: outcome.score,
    rating_before: current.rating,
    rating_after: after.rating,
  });

  const delta = after.rating - current.rating;
  const deltaStr = delta >= 0 ? pc.green(`+${delta.toFixed(0)}`) : pc.red(delta.toFixed(0));
  console.log(
    `\nScore ${pc.bold(outcome.score.toFixed(2))}` +
      ` · ${axis} rating ${current.rating.toFixed(0)} → ${pc.bold(after.rating.toFixed(0))} (${deltaStr})` +
      (mode === "ai-on" ? pc.dim("  [ai-on: recorded, rating untouched]") : ""),
  );
  return true;
}

const FRESHNESS_BADGE: Record<Freshness, string> = {
  fresh: pc.green("● fresh"),
  aging: pc.yellow("◐ aging"),
  cracking: pc.magenta("◍ cracking"),
  stale: pc.red("○ stale"),
};

function daysAgo(iso: string | null): string {
  if (!iso) return "never";
  const days = (Date.now() - Date.parse(iso)) / 86_400_000;
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  return `${Math.floor(days)}d ago`;
}

function stats(store: Store): void {
  const rows = AXES.map((axis) => ({ axis, ...store.getRating(axis) }));
  const anyReps = rows.some((r) => r.reps > 0);
  console.log(pc.bold("\n  Atrophy — unaided skill baseline\n"));
  const header = ["axis".padEnd(16), "rating".padStart(7), "±RD".padStart(5), "reps".padStart(5), "tier".padStart(5), "last rep".padStart(10), "  state"];
  console.log(pc.dim("  " + header.join("  ")));
  for (const r of rows) {
    const untested = r.reps === 0;
    // Wide RD in the first few reps means "still calibrating", not "decayed".
    const state = untested
      ? pc.dim("untested")
      : r.reps < 5 && freshness(r.rd) !== "fresh"
        ? pc.cyan("◌ calibrating")
        : FRESHNESS_BADGE[freshness(r.rd)];
    const line = [
      r.axis.padEnd(16),
      (untested ? "—" : r.rating.toFixed(0)).padStart(7),
      (untested ? "—" : r.rd.toFixed(0)).padStart(5),
      String(r.reps).padStart(5),
      String(r.tier).padStart(5),
      daysAgo(r.updatedAt).padStart(10),
      "  " + state,
    ].join("  ");
    console.log("  " + (untested ? pc.dim(line) : line));
  }
  if (!anyReps) {
    console.log(pc.dim("\n  No reps yet. Run ") + pc.cyan("atrophy baseline") + pc.dim(" to set your unaided baseline."));
  } else {
    console.log(pc.dim("\n  RD widens while you coast — that's confidence decaying, not the score."));
    const last = store.lastDrillTs();
    const idleDays = last ? (Date.now() - Date.parse(last)) / 86_400_000 : Infinity;
    if (idleDays > 3) {
      console.log(
        pc.yellow(`  ⚠ ${Math.floor(idleDays)} days since your last unaided rep.`) +
          pc.dim(" 2–3x/week keeps the baseline honest — run ") + pc.cyan("atrophy drill") + pc.dim("."),
      );
    }
  }
  console.log();
}

function dashboardHtmlPath(): string {
  const candidates = [
    join(__dirname, "..", "dashboard", "index.html"), // tsx dev: cli/../dashboard
    join(__dirname, "..", "..", "dashboard", "index.html"), // built: dist/cli/../../dashboard
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error("dashboard/index.html not found");
  return found;
}

function exportJson(store: Store, out?: string): void {
  const json = JSON.stringify(buildPayload(store), null, 2);
  if (out) {
    writeFileSync(out, json, "utf8");
    console.log(`wrote ${out}`);
  } else {
    console.log(json);
  }
}

async function baseline(store: Store, flags: DrillFlags): Promise<void> {
  const bank = loadBank(bankDir());
  const axesWithExercises = AXES.filter((a) => bank.some((ex) => ex.axis === a));
  console.log(
    pc.bold("Baseline session") +
      ` — one unaided drill per axis (${axesWithExercises.length} available today).`,
  );
  for (const axis of axesWithExercises) {
    const ok = await drillOnce(store, { ...flags, axis });
    if (!ok) break;
  }
  stats(store);
}

function cliVersion(): string {
  // package.json sits one level up in dev (cli/) and two up when built (dist/cli/)
  for (const p of [join(__dirname, "..", "package.json"), join(__dirname, "..", "..", "package.json")]) {
    try {
      const pkg = JSON.parse(readFileSync(p, "utf8")) as { name?: string; version?: string };
      if (pkg.name === "atrophy" && pkg.version) return pkg.version;
    } catch {
      /* try next candidate */
    }
  }
  return "unknown";
}

const program = new Command();
program
  .name("atrophy")
  .description("Measure what your brain is losing while AI does your work.")
  .version(cliVersion());

program
  .command("drill")
  .description("run one unaided micro-drill (5–10 min)")
  .option("-a, --axis <axis>", `skill axis: ${AXES.join(", ")}`)
  .option("-l, --lang <language>", "python or javascript")
  .option("--ai-on", "monthly comparison rep WITH your AI tools (plots the gap, never touches your unaided rating)")
  .option("--solution <file>", "non-interactive: grade this file as the submission (scripting/tests)")
  .action(async (flags: DrillFlags) => {
    const store = new Store();
    try {
      const ok = await drillOnce(store, flags);
      if (!ok) process.exitCode = 1;
    } finally {
      store.close();
    }
  });

program
  .command("baseline")
  .description("initial ~25 min session: one drill per axis, AI off")
  .option("-l, --lang <language>", "python or javascript")
  .action(async (flags: DrillFlags) => {
    const store = new Store();
    try {
      await baseline(store, flags);
    } finally {
      store.close();
    }
  });

program
  .command("stats")
  .description("per-axis ratings, confidence decay, and recency")
  .action(() => {
    const store = new Store();
    try {
      stats(store);
    } finally {
      store.close();
    }
  });

program
  .command("serve")
  .description("serve the decay dashboard locally (reads live data on refresh)")
  .option("-p, --port <port>", "port on 127.0.0.1", "4646")
  .action(async (flags: { port: string }) => {
    const store = new Store();
    const port = Number.parseInt(flags.port, 10);
    await startServer(store, dashboardHtmlPath(), port);
    console.log(pc.bold("\n  Atrophy dashboard: ") + pc.cyan(`http://127.0.0.1:${port}`));
    console.log(pc.dim("  Ctrl+C to stop. Data refreshes from SQLite on every reload.\n"));
  });

program
  .command("publish")
  .description("opt-in: post your ratings to the public leaderboard under a handle")
  .option("--handle <name>", "public handle (3-20 chars; saved after first publish)")
  .option("--url <url>", "leaderboard API override")
  .action(async (flags: { handle?: string; url?: string }) => {
    const store = new Store();
    try {
      await publishCommand(store, flags);
    } finally {
      store.close();
    }
  });

program
  .command("export")
  .description("dump ratings + sessions as JSON (feeds the dashboard)")
  .option("-o, --out <file>", "write to file instead of stdout")
  .action((flags: { out?: string }) => {
    const store = new Store();
    try {
      exportJson(store, flags.out);
    } finally {
      store.close();
    }
  });

program.parseAsync().catch((err) => {
  console.error(pc.red(String(err instanceof Error ? err.message : err)));
  process.exit(1);
});
