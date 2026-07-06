# Atrophy

**Measure what your brain is losing while AI does your work.**

![Atrophy decay dashboard — per-axis rating curves with cracking confidence bands, and the unaided vs AI-assisted divergence chart](docs/assets/atrophy-dashboard.gif)

The evidence is consistent across domains: [endoscopists' unaided detection rates dropped 28% → 22%](https://www.thelancet.com/journals/langas/article/PIIS2468-1253(25)00133-5/abstract) after routine AI exposure; [students with unrestricted GPT-4 scored 17% worse](https://www.pnas.org/doi/10.1073/pnas.2422633122) once access was removed; [experienced developers were 19% slower with AI while believing they were ~20% faster](https://arxiv.org/abs/2507.09089); and [AI-assisted engineers scored 17% lower on comprehension — with debugging declining most](https://www.anthropic.com/research/AI-assistance-coding-skills). There is no internal warning signal. Advice like "No-AI Days" exists everywhere; nothing *measures* whether you still can. ([Full citations](docs/research.md))

Atrophy gives you a personal **unaided-skill baseline** and a **decay curve** — like a fitness app's resting heart rate, but for your coding brain. Short scheduled drills (5–10 min, AI off) are the workout; the chart is the reason you stay.

## Status: M2 — the chart is live

- ✅ `atrophy drill` — one unaided micro-drill; auto-picks your most-overdue axis. Temp dir + `AI-OFF.lock`, opens `$EDITOR`, soft time limits (going over shrinks the score; nothing explodes)
- ✅ **Five drill kinds:** write-from-spec and fix-the-planted-bug (auto-graded by hidden tests in a sandboxed subprocess, retry loop) · predict-the-output (ground truth computed by actually running the snippet) · stdlib fill-in-the-blank · design outlines self-scored against a rubric
- ✅ 31 exercises: syntax-recall (6), debugging (8), code-reading (8), api-memory (6), decomposition (3) — Python + JavaScript, tiers 1–3
- ✅ `atrophy baseline` — one drill per axis to seed your profile (~25 min)
- ✅ `atrophy stats` — per-axis Elo rating ± confidence (RD), recency, freshness; nags when you've coasted >3 days
- ✅ `atrophy serve` — local decay dashboard: per-axis rating curves with a ±RD confidence band that visibly "cracks" while you coast, and the divergence chart — unaided vs AI-assisted scores drifting apart (feed it monthly with `atrophy drill --ai-on`)
- ✅ `atrophy export` — the same JSON payload the dashboard reads
- 🔜 M3: README citations, demo GIF, npm publish, launch post

## Install & run

Requires Node ≥ 22 (Node 20 is EOL and better-sqlite3 no longer ships prebuilds for it). Python 3 on `PATH` for the Python exercises.

```sh
npm install
npm run build

node dist/cli/index.js baseline   # first session (~15 min today)
node dist/cli/index.js drill      # one rep
node dist/cli/index.js drill --axis syntax-recall --lang javascript
node dist/cli/index.js stats
node dist/cli/index.js serve             # decay dashboard at 127.0.0.1:4646
node dist/cli/index.js export -o atrophy.json
```

Dev mode: `npm run dev -- drill`. Tests: `npm test`.

## How scoring works

- **Per exercise:** `score = (tests passed / total) × time factor`. The time factor is 1.0 up to the soft limit, then decays exponentially with a floor — a slow correct answer always beats a fast wrong one.
- **Per axis:** Elo-style rating (K=32 for your first 10 reps, then 16) against the exercise's difficulty tier, so scores are comparable across exercises.
- **Decay:** Glicko-style rating deviation (RD) widens while you coast — up to fully "cracked" after ~60 idle days. Your rating never drops without evidence; your *confidence* in it does. That distinction is the product.
- **Adaptive difficulty:** two consecutive strong passes promote you a tier; two fails demote.

## Honest caveats

Micro-drills are a *proxy* for real-world skill, not a clinical instrument. Practice effects are real — and fine: the drill *is* the maintenance. AI-off is honor-system in v1 (the lockfile states the pledge; process detection is v2).

## Layout

```
cli/        commander CLI (drill, baseline, stats, export)
engine/     subprocess runner, grading harnesses, Elo/RD scoring, drill session
bank/       exercise JSON + zod schema/loader
store/      better-sqlite3, local-first: ~/.atrophy/atrophy.db (override: ATROPHY_DB)
dashboard/  (M2) decay curves + AI-on/AI-off divergence
docs/       research notes & citations
```

Your data is one SQLite file you own. No accounts, no sync, no telemetry.
