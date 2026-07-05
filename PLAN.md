# Atrophy — AI Capability Decay Tracker

> Working name: **Atrophy** (rename freely). A tool that measures what your brain is losing while AI does your work — starting with coding skills — and keeps your baseline alive with short, scheduled "reliance drills."

## 1. Problem (validated)

- Documented pattern across domains: clinicians, pilots, students, and developers all show measurable skill loss when an AI/automation layer is removed (endoscopist detection rates dropped 28% → 22%; students with GPT-4 access underperformed peers once access was removed).
- The dangerous part: developers *feel ~20% faster while comprehension drops ~17%* — there is no internal warning signal.
- The recommended fixes in the literature ("No-AI Days", "reliance drills", "analog practice") are all manual, unmeasured, and rely on willpower.
- **Gap verified (July 2026):** advice articles exist everywhere; no consumer product measures unaided skill over time. This tool is that product.

## 2. Core insight / product thesis

You cannot manage what you don't measure. Atrophy gives users a **personal unaided-skill baseline** and a **decay curve** — the same way a fitness app gives you a resting heart rate. The drill is the workout; the chart is the reason people stay.

Non-goals (v1): preaching, blocking AI tools, team/manager surveillance features, non-coding domains.

## 3. MVP scope — coding skills only

Why coding first: easiest domain to instrument (everything happens in editor/terminal), the user is a developer, and the research evidence is strongest here.

### 3.1 The drill loop (the whole product)

1. **Baseline session (~25 min, once):** user completes 4–6 short exercises with AI assistance *disabled*, across skill axes below. Produces initial radar profile.
2. **Micro-drills (5–10 min, 2–3x/week, scheduled):** one exercise per session, no AI. Timed, auto-graded.
3. **Decay dashboard:** per-axis score over time, trend arrows, "last unaided rep" recency. The killer chart: *your score with AI* vs *your score without AI* diverging.
4. **Streak/recovery mechanics:** skill "half-life" model — each axis decays visually if not exercised (like Duolingo's cracked skills, but for real abilities).

### 3.2 Skill axes (v1)

| Axis | Drill type | Auto-gradable? |
|---|---|---|
| Syntax recall | Write function from spec, no autocomplete | Yes — unit tests |
| Debugging | Find/fix planted bug in 30–60 line snippet | Yes — tests pass |
| Code reading | Predict output of a snippet | Yes — exact match |
| API/stdlib memory | Fill-in-the-blank on common stdlib calls | Yes |
| Decomposition | Outline approach to a problem in pseudocode | v1: self-rated; v2: LLM-judged |

### 3.3 Exercise generation

- Seed bank: 50 hand-curated exercises per axis (start with Python + JS/TS).
- Generation pipeline: use an LLM **offline/at build time** to generate variants + tests; human-review before shipping. (Irony guard: AI generates the drills, but never helps during them.)
- Difficulty ladder: 3 tiers per axis; adaptive — 2 consecutive passes promotes, 2 fails demotes.

### 3.4 Scoring model

- Per-exercise: `score = correctness (0/1 partial via tests) × time-decay factor` (soft time limit; no brutal timers).
- Per-axis rating: Elo-style update (K=32 early, K=16 after 10 reps) so scores are comparable across exercises of different difficulty.
- Decay model: rating confidence widens with inactivity (Glicko-style RD), rendered as the "cracking" visual. We never *lower* the score without evidence — we lower *confidence*.

## 4. Architecture (v1 = local-first CLI + web dashboard)

```
atrophy/
├── cli/            # TypeScript (or Python) CLI: `atrophy drill`, `atrophy baseline`, `atrophy stats`
├── engine/         # exercise runner: sandboxed execution (Docker or node:vm / subprocess), grading, Elo updates
├── bank/           # exercises as JSON/YAML: prompt, starter code, hidden tests, axis, tier, language
├── store/          # SQLite (single file, user-owned; local-first by principle — this audience cares)
├── dashboard/      # static site (React + Recharts) reading exported JSON, or `atrophy serve`
└── docs/
```

Key decisions:
- **CLI-first.** The target user lives in a terminal; a CLI is also the fastest MVP. VS Code extension is v2.
- **Local-first, no accounts.** SQLite file the user owns. Sync/leaderboards are v3, opt-in.
- **Sandboxed grading.** Run user code in a subprocess with timeouts + no network. Docker optional but recommended for untrusted test execution.
- **AI-off enforcement (honor system v1):** drill runs in a bare temp dir opened via `$EDITOR` with a lockfile; v2 can detect Copilot/Claude Code processes and warn (never block).

## 5. Milestones

**M0 — Skeleton (weekend):** CLI scaffold, one axis (syntax recall), 10 Python exercises, subprocess grading, SQLite storage, `atrophy stats` prints a table.

**M1 — Real loop (week 2–3):** all 5 axes, 30+ exercises, Elo scoring, baseline flow, scheduling via reminder (cron/launchd or just nag-on-invoke).

**M2 — The chart (week 4):** dashboard with per-axis decay curves + the AI-on vs AI-off divergence view (user optionally re-takes one drill *with* AI monthly to plot the gap).

**M3 — Ship (week 5–6):** README with the research citations, demo GIF, publish to npm/PyPI + GitHub, post to HN/r/programming ("I measured my own skill atrophy for 30 days" is the launch post).

**M4 — v2 candidates (post-launch, pick by feedback):** VS Code extension, LLM-judged decomposition drills, more languages, team mode, spaced-repetition scheduling (FSRS).

## 6. Risks & honest caveats

- **Measurement validity:** micro-drills ≠ real-world skill. Mitigation: frame as *proxy* metrics; never claim clinical validity.
- **Practice effect confound:** doing drills improves drill scores. That's… fine — the product's goal is maintaining skill, and the drill *is* the maintenance. But the decay chart must distinguish "untested" from "declining."
- **Motivation cliff:** fitness apps die at week 3. Mitigation: 5-minute sessions, streaks, and making the chart genuinely interesting.
- **Fast-follow risk:** low moat. Mitigation: ship fast, own the narrative + exercise bank quality.

## 7. First tasks for Claude Code (ordered)

1. `init`: scaffold repo per §4 layout (choose TypeScript; Node ≥20; vitest for tests).
2. Implement exercise schema + loader (`bank/schema.ts`, validate with zod).
3. Implement subprocess runner with timeout + resource limits for Python and Node exercises.
4. Implement Elo/Glicko-lite scoring module with unit tests.
5. Build `atrophy drill` end-to-end for the syntax-recall axis with 5 seed exercises.
6. Build `atrophy stats` (table output) and JSON export.
7. Write 25 more exercises across debugging + code-reading axes (generate drafts, I review).

## 8. Success criteria (30 days post-launch)

- I personally complete 12+ drills (dogfood or die).
- 100 GitHub stars or 20 unique users with >3 sessions.
- One piece of feedback that says "the chart scared me" — that's product-market fit for this idea.