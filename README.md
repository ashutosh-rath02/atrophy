# Atrophy

**Measure what your brain is losing while AI does your work.**

AI assistance makes you feel ~20% faster while comprehension drops ~17% — and there is no internal warning signal. Clinicians, pilots, students, and developers all show measurable skill loss once the AI layer is removed. Advice like "No-AI Days" exists everywhere; nothing *measures* whether you still can.

Atrophy gives you a personal **unaided-skill baseline** and a **decay curve** — like a fitness app's resting heart rate, but for your coding brain. Short scheduled drills (5–10 min, AI off) are the workout; the chart is the reason you stay.

## Status: M0 skeleton

- ✅ `atrophy drill` — one unaided micro-drill: temp dir + `AI-OFF.lock`, opens `$EDITOR`, auto-graded by hidden tests in a sandboxed subprocess, retry loop, soft time limits (going over shrinks the score; nothing explodes)
- ✅ `atrophy baseline` — one drill per available axis to seed your profile
- ✅ `atrophy stats` — per-axis Elo rating ± confidence (RD), rep count, recency, freshness
- ✅ `atrophy export` — JSON dump for the upcoming dashboard
- ✅ Syntax-recall axis with 6 seed exercises (Python + JavaScript)
- 🔜 Debugging, code-reading, API-memory, decomposition axes · decay dashboard · AI-on vs AI-off divergence chart

## Install & run

Requires Node ≥ 20. Python 3 on `PATH` for the Python exercises.

```sh
npm install
npm run build

node dist/cli/index.js baseline   # first session (~15 min today)
node dist/cli/index.js drill      # one rep
node dist/cli/index.js drill --axis syntax-recall --lang javascript
node dist/cli/index.js stats
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
