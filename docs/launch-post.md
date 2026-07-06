# Launch post draft — "I measured my own skill atrophy for 30 days"

> Target: HN (Show HN) + r/programming. Post AFTER 30 days of dogfooding —
> the personal data IS the post. Fill every ⟨bracket⟩ with your real numbers.
> Honesty is the moat: no clinical claims, show the confounds.

---

**Title options**

- Show HN: I measured my own skill atrophy for 30 days (open-source CLI)
- Show HN: Atrophy – a decay curve for your unaided coding skill

**Body**

Last year three studies scared me in the same way:

- Endoscopists' unaided detection rates dropped 28% → 22% after months of
  routine AI assistance (Lancet Gastro Hep, 2025)
- Experienced OSS devs were 19% *slower* with AI while believing they were
  ~20% faster (METR RCT, 2025)
- Engineers using AI scored 17% lower on comprehension of code they'd just
  written — debugging declined most (Anthropic RCT, 2026)

The common thread isn't "AI bad" — it's that **there is no internal warning
signal**. You can't feel the decay. So I built a ruler.

Atrophy is a local-first CLI that gives you an unaided-skill baseline and a
decay curve. 5–10 minute drills, 2–3x a week, AI off (honor system, lockfile
in the drill dir as a reminder). Five axes: syntax recall, debugging (fix a
planted bug), code reading (predict the exact output), API memory
(fill-in-the-blank), decomposition (outline vs rubric). Elo per axis;
inactivity widens a Glicko-style confidence band instead of lowering your
score — the chart "cracks" but never lies about what it measured.

The killer chart: once a month I re-take one drill WITH my AI tools and plot
both lines. After 30 days: ⟨your unaided trend⟩ vs ⟨your AI-on trend⟩.
⟨One honest sentence about what surprised you — e.g. "my debugging axis
dropped a tier and I genuinely didn't feel it happening."⟩

Honest caveats, because this audience will find them anyway:

- Micro-drills are a proxy, not a clinical instrument.
- Practice effects are real; the drill *is* the maintenance, so that's fine —
  but the chart distinguishes "untested" from "declining."
- AI-off is honor system in v1. Process detection is v2, and it will warn,
  never block.

Everything is local: one SQLite file you own, no accounts, no telemetry.
`npm i -g atrophy`, `atrophy baseline`, and in a month you'll have your own
chart. I'd genuinely like to know if yours scares you too.

GitHub: https://github.com/ashutosh-rath02/atrophy

---

**First comment (pre-write it — HN asks these within minutes):**

- "Isn't this just leetcode?" → No timer pressure to game, no leaderboard, no
  interview prep. The unit is *change in your own unaided score*, not rank.
- "Practice effect makes the numbers meaningless" → It inflates the absolute
  level, not the AI-on/AI-off *gap*, which is measured on the same drills.
- "Honor system is a joke" → The user is the only person being defrauded.
  This is a bathroom scale, not a proctored exam.
