import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Axis } from "../bank/schema.js";
import {
  INITIAL_RATING,
  INITIAL_RD,
  decayRd,
  type RatingState,
} from "../engine/scoring.js";

export interface SessionRow {
  id: number;
  ts: string;
  exercise_id: string;
  axis: string;
  language: string;
  tier: number;
  mode: "ai-off" | "ai-on";
  passed: number;
  total: number;
  elapsed_seconds: number;
  score: number;
  rating_before: number;
  rating_after: number;
}

export interface AxisRow {
  axis: string;
  rating: number;
  rd: number;
  reps: number;
  tier: number;
  updated_at: string;
}

export function defaultDbPath(): string {
  return process.env.ATROPHY_DB ?? join(homedir(), ".atrophy", "atrophy.db");
}

export class Store {
  private db: Database.Database;

  constructor(path = defaultDbPath()) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        axis TEXT NOT NULL,
        language TEXT NOT NULL,
        tier INTEGER NOT NULL,
        mode TEXT NOT NULL DEFAULT 'ai-off',
        passed INTEGER NOT NULL,
        total INTEGER NOT NULL,
        elapsed_seconds REAL NOT NULL,
        score REAL NOT NULL,
        rating_before REAL NOT NULL,
        rating_after REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_axis_ts ON sessions(axis, ts);
      CREATE TABLE IF NOT EXISTS ratings (
        axis TEXT PRIMARY KEY,
        rating REAL NOT NULL,
        rd REAL NOT NULL,
        reps INTEGER NOT NULL,
        tier INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
    `);
  }

  /** Rating with RD widened for time elapsed since the last rep. */
  getRating(axis: Axis, now = new Date()): RatingState & { tier: number; updatedAt: string | null } {
    const row = this.db
      .prepare<[string], AxisRow>("SELECT * FROM ratings WHERE axis = ?")
      .get(axis);
    if (!row) {
      return { rating: INITIAL_RATING, rd: INITIAL_RD, reps: 0, tier: 1, updatedAt: null };
    }
    const idleDays = Math.max(0, (now.getTime() - Date.parse(row.updated_at)) / 86_400_000);
    return {
      rating: row.rating,
      rd: decayRd(row.rd, idleDays),
      reps: row.reps,
      tier: row.tier,
      updatedAt: row.updated_at,
    };
  }

  saveRating(axis: Axis, state: RatingState, tier: number, now = new Date()): void {
    this.db
      .prepare(
        `INSERT INTO ratings (axis, rating, rd, reps, tier, updated_at)
         VALUES (@axis, @rating, @rd, @reps, @tier, @updatedAt)
         ON CONFLICT(axis) DO UPDATE SET
           rating = @rating, rd = @rd, reps = @reps, tier = @tier, updated_at = @updatedAt`,
      )
      .run({ axis, ...state, tier, updatedAt: now.toISOString() });
  }

  recordSession(s: Omit<SessionRow, "id">): void {
    this.db
      .prepare(
        `INSERT INTO sessions
           (ts, exercise_id, axis, language, tier, mode, passed, total,
            elapsed_seconds, score, rating_before, rating_after)
         VALUES (@ts, @exercise_id, @axis, @language, @tier, @mode, @passed, @total,
            @elapsed_seconds, @score, @rating_before, @rating_after)`,
      )
      .run(s);
  }

  recentSessions(axis: Axis, limit = 10): SessionRow[] {
    return this.db
      .prepare<[string, number], SessionRow>(
        "SELECT * FROM sessions WHERE axis = ? ORDER BY ts DESC, id DESC LIMIT ?",
      )
      .all(axis, limit);
  }

  allSessions(): SessionRow[] {
    return this.db
      .prepare<[], SessionRow>("SELECT * FROM sessions ORDER BY ts ASC, id ASC")
      .all();
  }

  allRatings(): AxisRow[] {
    return this.db.prepare<[], AxisRow>("SELECT * FROM ratings ORDER BY axis").all();
  }

  close(): void {
    this.db.close();
  }
}
