import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import pc from "picocolors";
import { AXES } from "../bank/schema.js";
import { INITIAL_RATING } from "../engine/scoring.js";
import type { Store } from "../store/db.js";

/** Patched to the deployed Worker URL; override with ATROPHY_LEADERBOARD_URL. */
export const DEFAULT_LEADERBOARD_URL = "https://atrophy-leaderboard.ashutosh123rath.workers.dev";

/** Publishing unlocks after a full baseline — keeps drive-by junk off the board. */
export const MIN_REPS_TO_PUBLISH = 5;

export interface Snapshot {
  overall: number;
  reps: number;
  axes: Record<string, { rating: number; rd: number; reps: number }>;
}

/**
 * Overall = mean rating across ALL five axes, with untested axes counted at
 * the 1200 starting rating — so you can't inflate the number by publishing
 * only your best axis.
 */
export function buildSnapshot(store: Store): Snapshot {
  const axes: Snapshot["axes"] = {};
  let sum = 0;
  let reps = 0;
  for (const axis of AXES) {
    const r = store.getRating(axis);
    if (r.reps > 0) {
      axes[axis] = { rating: r.rating, rd: r.rd, reps: r.reps };
      sum += r.rating;
      reps += r.reps;
    } else {
      sum += INITIAL_RATING;
    }
  }
  return { overall: sum / AXES.length, reps, axes };
}

interface Config {
  leaderboard?: { token?: string; handle?: string; url?: string };
}

function configPath(): string {
  return process.env.ATROPHY_CONFIG ?? join(homedir(), ".atrophy", "config.json");
}

function readConfig(): Config {
  try {
    // tolerate a UTF-8 BOM (hand-edited or PowerShell-written configs)
    return JSON.parse(readFileSync(configPath(), "utf8").replace(/^﻿/, "")) as Config;
  } catch {
    return {};
  }
}

function writeConfig(config: Config): void {
  mkdirSync(dirname(configPath()), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(config, null, 2), "utf8");
}

/** Registered for the leaderboard = auto-sync after every unaided drill. */
export function isRegistered(): boolean {
  const lb = readConfig().leaderboard;
  return Boolean(lb?.token && lb.handle);
}

/**
 * Fire-and-mostly-forget sync after a drill: quiet on success, quieter on
 * failure — a dead network must never get between the user and their rep.
 */
export async function autoSync(store: Store): Promise<void> {
  const lb = readConfig().leaderboard;
  if (!lb?.token || !lb.handle) return;
  const snap = buildSnapshot(store);
  const url = process.env.ATROPHY_LEADERBOARD_URL ?? lb.url ?? DEFAULT_LEADERBOARD_URL;
  try {
    const res = await fetch(`${url}/v1/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: lb.token, handle: lb.handle, ...snap }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      console.log(pc.dim(`  leaderboard synced · ${lb.handle} · overall ${Math.round(snap.overall)}`));
    } else {
      console.log(pc.dim(`  (leaderboard sync skipped: HTTP ${res.status})`));
    }
  } catch {
    console.log(pc.dim("  (leaderboard sync skipped: offline)"));
  }
}

/** One dim line nudging eligible-but-unregistered users toward the board. */
export function maybePrintPublishHint(store: Store): void {
  const snap = buildSnapshot(store);
  if (snap.reps >= MIN_REPS_TO_PUBLISH) {
    console.log(
      pc.dim("  join the leaderboard (auto-syncs after every drill): ") +
        pc.cyan("atrophy publish --handle you"),
    );
  }
}

export async function publishCommand(
  store: Store,
  opts: { handle?: string; url?: string; stop?: boolean },
): Promise<void> {
  if (opts.stop) {
    const config = readConfig();
    if (config.leaderboard) {
      delete config.leaderboard;
      writeConfig(config);
      console.log(
        "auto-sync stopped; your existing entry stays on the board " +
          pc.dim("(open an issue on the repo to have it deleted)"),
      );
    } else {
      console.log(pc.dim("you weren't registered — nothing to stop"));
    }
    return;
  }
  const snap = buildSnapshot(store);
  if (snap.reps < MIN_REPS_TO_PUBLISH) {
    console.error(
      pc.red(`publishing unlocks after ${MIN_REPS_TO_PUBLISH} unaided reps`) +
        pc.dim(` (you have ${snap.reps} — run atrophy drill)`),
    );
    process.exitCode = 1;
    return;
  }

  const config = readConfig();
  const saved = config.leaderboard ?? {};
  const handle = opts.handle ?? saved.handle;
  if (!handle) {
    console.error(
      pc.red("pick a public handle first: ") + pc.cyan("atrophy publish --handle your-name") +
        pc.dim("  (3-20 chars: letters, digits, - or _)"),
    );
    process.exitCode = 1;
    return;
  }
  const url =
    opts.url ?? process.env.ATROPHY_LEADERBOARD_URL ?? saved.url ?? DEFAULT_LEADERBOARD_URL;

  if (!saved.token) {
    console.log(
      pc.dim("Opt-in: this sends your handle, per-axis ratings, and rep counts —") +
        pc.dim(" nothing else — to the public leaderboard. Delete anytime by asking in the repo."),
    );
  }

  let res: Response;
  try {
    res = await fetch(`${url}/v1/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: saved.token, handle, ...snap }),
    });
  } catch (err) {
    console.error(pc.red(`could not reach the leaderboard: ${(err as Error).message}`));
    process.exitCode = 1;
    return;
  }
  const body = (await res.json().catch(() => ({}))) as {
    token?: string;
    handle?: string;
    error?: string;
  };
  if (!res.ok || !body.token) {
    console.error(pc.red(`publish failed: ${body.error ?? res.statusText}`));
    if (res.status === 409) console.error(pc.dim("try a different --handle"));
    process.exitCode = 1;
    return;
  }

  config.leaderboard = { token: body.token, handle: body.handle, url };
  writeConfig(config);

  // show where you landed
  try {
    const lb = (await (await fetch(`${url}/v1/leaderboard`)).json()) as {
      count: number;
      entries: Array<{ handle: string; overall: number }>;
    };
    const rank = lb.entries.findIndex((e) => e.handle === body.handle) + 1;
    const rankText = rank > 0 ? `#${rank} of ${lb.count}` : `among ${lb.count} entries`;
    console.log(
      pc.green(`\npublished as ${pc.bold(body.handle ?? handle)}`) +
        ` · overall ${pc.bold(Math.round(snap.overall).toString())} · ${rankText}`,
    );
  } catch {
    console.log(pc.green(`\npublished as ${body.handle ?? handle}`));
  }
}
