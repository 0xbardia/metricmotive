# Phase 4 report (v2.1), 390 px, 4x CPU, paired n=5 unless stated

Model: the main session runs on Sonnet 5.5 (switched with `/model` after Phase 3). Commits up to `d3ae839` carry the
Haiku 5.5 trailer, from the earlier model. Commits from `f37719f` on carry Sonnet 5.5. The plan has the main model plan
and run QA, with Sonnet 5.5 subagents implementing; here the main model is itself Sonnet 5.5. Two Sonnet 5.5 subagents
implemented the Phase 4 motion (receipt; dApp), each with file ownership. I wrote the contract, reviewed both diffs, and
ran all QA.

## 1. Demo TBT gap (717 to 1059): not reproducible, header unchanged

Header with both tone layers removed, against HEAD (`exp1-header-layers`, loads 7.7 to 12):

| page | HEAD TBT median [range] | no layers |
|---|---|---|
| demo | 659 [446–864] | 467 [398–1076] |
| landing | 449 [381–661] | 602 [379–753] |

The ranges overlap, and landing goes the opposite way. HEAD's demo median (659) is in line with rc6's earlier 717, so
the 1059 was noise. No cause found in the header, and no change made.

## 2. Idle-time mount and view() reveals: not kept

Idle queue (one section per idle callback, 2 s timeout), then the view-timeline reveals with IO fallback restored.
Against HEAD, paired:

| build | landing TBT | landing frames > 33 ms | landing p95 | demo (TBT / > 33 ms) |
|---|---|---|---|---|
| HEAD | 412 [378–571], 429 [378–534] | 9 [6–15], 7 [4–10] | 17 | 457 / 1, 461 / 1 |
| idle only | 488 [459–790] | 3 [0–3] | 17 | 438 / 0 |
| idle + reveals | 535 [508–606] | 3 [1–5] | 17 | 423 / 1 |

Scroll frames improve, but load-time landing TBT is worse (+76 ms idle only, +106 ms with reveals; the second
range does not overlap HEAD's). Your condition was both equal or better, so the reveals are not kept, and idle mounting
alone is also not kept (same TBT cost). Reverted. The idle-only build is the better trade if you prefer scroll smoothness
over load TBT; say so and it goes in.

The 635 ms recalc's new position: with idle mounting, the case section mounts in the first idle slot at about 3.4 s,
as style for 159 elements (65 ms) plus layout (53 ms), so about 120 ms, not one long task.

## 3. (c) entry chunk and (a) static H1

- (c) Nothing meaningful to move. The entry is 123 KB gzip of React, router and query. Landing code outside the hero is
  already split (routes chunk 3.5 KB gzip; five sections lazy). No change.
- (a) Static Fraunces instance for the H1 (SOFT 0, WONK 0, opsz 48, wght 600, Latin): 17,920 B (variable file 61,788 B,
  still needed for other headings, so about +18 kB, inside the budget). Layout in the first 1.5 s, four interleaved traces
  each: HEAD 114 to 200 ms, variant 126 to 350 ms; style similar. No saving above 50 ms, so not applied.

## 4. Model

Main session: Sonnet 5.5 (see top).

## 5. Phase 4 (dApp and receipt motion)

Contract (`f37719f`): `useEntering()` plus `enter-on` / `rise` / `d1` to `d3`; transform only; off under reduced motion;
pinned in `scripts/route-enter.test.mjs`. Subagents: receipt (`$receiptId.tsx`, 3 elements) and dApp
(`app-home-content.tsx` 3 elements; wizard step panel keyed by step, 2 to 3 elements). Typecheck, lint and tests passed
(184 script tests, 65 source tests).

**Receipt: not renderable here.** The receipt loader needs a database, and this worktree has none (no `.env`; the only
local Postgres belongs to another tenant, so I did not use it). The page renders only "This receipt does not exist". So the
receipt motion could be reviewed, typechecked and tested, but not rendered or measured, and I did not ship it. It is saved as
`receipt-entrance.patch`. Earlier "receipt" figures in this thread, including the Phase 1b receipt Lighthouse rows and
Phase 2 CLS/JS audits, were taken on that not-found page, not on a real receipt. They need to be redone on a seeded
preview.

**dApp: removed.** Baseline `f37719f` against the candidate, loads 11 to 12 (right at the 2-per-core limit):

| page | metric | baseline | candidate |
|---|---|---|---|
| `/app` | TBT | 625 [614–1041] | 960 [867–1019] |
| `/app` | frames > 33 ms | 8 [5–12] | 11 [8–14] |
| wizard | TBT | 1620 [38–2556] | 1431 [1128–2106] |
| wizard | frames > 33 ms | 7 [4–27] | 12 [5–21] |

Frames got worse on both pages, so the motion is removed (`dapp-entrance.patch` keeps it). The tree has no Phase 4 motion
in it.

**Videos** (untracked): `videos/{base,motion}-{app,wizard}-390.webm`.

## Open

- Receipt needs a seeded, database-backed preview to render, measure and re-measure the earlier receipt numbers.
- Idle mounting alone: keep or not (scroll better, load TBT worse).
- Loads were at the 2-per-core edge in the dApp round.
