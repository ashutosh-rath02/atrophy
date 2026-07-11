import { writeFileSync } from "node:fs";
import pc from "picocolors";
import { AXES, type Axis } from "../bank/schema.js";
import { freshness } from "../engine/scoring.js";
import { computeStreak } from "../engine/streak.js";
import type { Store } from "../store/db.js";
import { buildSnapshot } from "./publish.js";

/**
 * `atrophy report`: a shareable summary of your baseline. Markdown by default
 * (great for a README or a post), or a self-contained SVG card with `--out
 * *.svg` (no external assets, so it embeds/shares anywhere). The data model is
 * pure and unit-tested; rendering is just string building.
 */

export interface ReportAxis {
  axis: Axis;
  rating: number | null; // null when untested
  reps: number;
  state: string;
}

export interface ReportModel {
  generatedAt: string;
  overall: number;
  totalReps: number;
  streakWeeks: number;
  axes: ReportAxis[];
  /** Mean(ai-on score) - mean(ai-off score), or null without both. */
  gap: number | null;
}

function axisState(rd: number, reps: number): string {
  if (reps === 0) return "untested";
  const f = freshness(rd);
  return reps < 5 && f !== "fresh" ? "calibrating" : f;
}

export function buildReport(store: Store, now = new Date()): ReportModel {
  const snap = buildSnapshot(store);
  const axes: ReportAxis[] = AXES.map((axis) => {
    const r = store.getRating(axis, now);
    return {
      axis,
      rating: r.reps === 0 ? null : Math.round(r.rating),
      reps: r.reps,
      state: axisState(r.rd, r.reps),
    };
  });

  const sessions = store.allSessions();
  const on = sessions.filter((s) => s.mode === "ai-on").map((s) => s.score);
  const off = sessions.filter((s) => s.mode === "ai-off").map((s) => s.score);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const gap = on.length > 0 && off.length > 0 ? mean(on) - mean(off) : null;

  return {
    generatedAt: now.toISOString(),
    overall: Math.round(snap.overall),
    totalReps: snap.reps,
    streakWeeks: computeStreak(sessions, now).weeks,
    axes,
    gap,
  };
}

export function renderMarkdown(m: ReportModel): string {
  const lines: string[] = [];
  lines.push("# Atrophy card");
  lines.push("");
  lines.push("Unaided coding-skill baseline, measured with AI off.");
  lines.push("");
  lines.push(
    `**Overall ${m.overall}** · ${m.totalReps} rep${m.totalReps === 1 ? "" : "s"} · ` +
      `${m.streakWeeks}-week streak`,
  );
  lines.push("");
  lines.push("| skill | rating | reps | state |");
  lines.push("|---|---|---|---|");
  for (const a of m.axes) lines.push(`| ${a.axis} | ${a.rating ?? "-"} | ${a.reps} | ${a.state} |`);
  lines.push("");
  if (m.gap !== null) {
    lines.push(`With-AI vs unaided gap: ${m.gap >= 0 ? "+" : ""}${m.gap.toFixed(2)} (per-drill score).`);
    lines.push("");
  }
  lines.push("Measured with Atrophy - https://github.com/ashutosh-rath02/atrophy");
  return lines.join("\n") + "\n";
}

export function renderSvg(m: ReportModel): string {
  const W = 720;
  const H = 440;
  const bg = "#0d0d0d";
  const ink = "#ffffff";
  const ink2 = "#b9b8b0";
  const accent = "#3987e5";
  const grid = "#26262a";
  const barX = 210;
  const barW = 380;
  const rowH = 46;
  const top = 150;

  const rows = m.axes
    .map((a, i) => {
      const y = top + i * rowH;
      const frac = a.rating === null ? 0 : Math.max(0, Math.min(1, (a.rating - 1000) / 500));
      return (
        `<text x="40" y="${y + 5}" fill="${ink2}" font-size="15">${a.axis}</text>` +
        `<rect x="${barX}" y="${y - 9}" width="${barW}" height="12" rx="6" fill="${grid}"/>` +
        (a.rating === null
          ? ""
          : `<rect x="${barX}" y="${y - 9}" width="${Math.round(barW * frac)}" height="12" rx="6" fill="${accent}"/>`) +
        `<text x="${W - 40}" y="${y + 5}" fill="${ink}" font-size="15" text-anchor="end" font-weight="600">${a.rating ?? "untested"}</text>`
      );
    })
    .join("");

  const gapLine =
    m.gap === null
      ? ""
      : `<text x="40" y="${top + 5 * rowH + 22}" fill="${ink2}" font-size="14">with-AI vs unaided gap: ${m.gap >= 0 ? "+" : ""}${m.gap.toFixed(2)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">
  <rect width="${W}" height="${H}" rx="18" fill="${bg}"/>
  <text x="40" y="58" fill="${ink}" font-size="30" font-weight="700">Atrophy</text>
  <text x="40" y="84" fill="${ink2}" font-size="15">Unaided coding-skill baseline, measured with AI off</text>
  <text x="${W - 40}" y="56" fill="${accent}" font-size="46" font-weight="800" text-anchor="end">${m.overall}</text>
  <text x="${W - 40}" y="80" fill="${ink2}" font-size="13" text-anchor="end">overall · ${m.totalReps} reps · ${m.streakWeeks}w streak</text>
  <line x1="40" y1="110" x2="${W - 40}" y2="110" stroke="${grid}"/>
  ${rows}
  ${gapLine}
  <text x="40" y="${H - 24}" fill="${ink2}" font-size="13">github.com/ashutosh-rath02/atrophy</text>
</svg>
`;
}

export function reportCommand(store: Store, opts: { out?: string }): void {
  const model = buildReport(store);
  const isSvg = opts.out !== undefined && opts.out.toLowerCase().endsWith(".svg");
  const content = isSvg ? renderSvg(model) : renderMarkdown(model);
  if (opts.out) {
    writeFileSync(opts.out, content, "utf8");
    console.log(pc.green(`wrote ${opts.out}`));
  } else {
    console.log(content);
  }
}
