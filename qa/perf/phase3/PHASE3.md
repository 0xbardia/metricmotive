# Phase 3 report (v2.1), 390 px, 4x CPU unless stated

Commits in this phase: `a26a9c4` (route-enter gate; the pre-motion baseline for the first comparison),
`9984226` (header rule on the border row; the baseline for the final comparison), then the hero entrance commit and the QA commit.

## 1. Commit attribution (reported, not rewritten)

- `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>` comes from the attribution instruction in this session's
  system context (it says to end commit messages with that line). It is not in git config: `/root/.gitconfig` has only
  `user.name 0xbardia` and `user.email`, and there is no trailer config. I did not run `/model`.
- Author and committer of every commit is `0xbardia`, from git config. The trailer is the only model attribution.
- Authorship: every commit from this session was written by the main session, on the session model (Haiku 5.5, as the
  environment states). No subagents were spawned in this session (no Agent calls). Background monitors and shells are
  not agents.
- Earlier commits in history (for example `8c7b439`) carry the same trailer. They predate this session, and I cannot
  verify who wrote them.

## 2. Route entrance gated after mount

- `src/components/route-enter.tsx` renders the wrapper with no animation and adds `route-enter-on` in an effect.
  The keyframes are transform-only, and reduced motion turns the animation off.
- Test: `scripts/route-enter.test.mjs` (5 tests, passing; with motion-props, 9 of 9).
- Runtime, 390 px:

| build | no JS | JS, 150 ms after commit | JS, after load |
|---|---|---|---|
| rc6 (`eb7a1b7`) | animation running, transform 1.7 px | animation running, transform 6 px (before any script ran) | running |
| baseline (`a26a9c4` and later) | no animation, transform none, opacity 1 | no animation | class added, 1 animation |

Opacity is 1 in every state. The default state is fully visible.

## 3. Header bottom rule (rc6's border strength)

Pixel values at x=4, scrolled, 1440 px (`qa/perf/phase3/header-rule-check.mjs`):

| | rc6 | before (`a26a9c4`) | after (`9984226`) |
|---|---|---|---|
| dark, row 66 | 42 | 66 | 41 |
| dark, row 67 (border row) | 69 | 48 | 67 |
| light, row 67 | 223 | 205 | 227 (4 levels lighter; within "or lighter") |

The change: the layers reach the border row, the line is drawn only on light headers (carbon 10%, rc6's strength), and dark
relies on the layer's ring, which already draws rc6's bone 12% line on that row. The earlier version had two rows of ink
(row 66 from the ring, row 67 from the line).

## 4. Load and cleanup

- Before cleanup, 23:05 UTC: 1-minute load 2.23 on 6 cores, 5-minute 2.37. Top consumers belonged to other tenants
  (Postgres `edgezero_v2`, a healthcheck, Hermes tools, `next-server`, opencode, anvil, other Claude sessions).
  Mine were the vite previews on 8095 and 8097 and a Python static server on 8093 (`qa/type`).
- Stopped mine (by PID, after checking each cwd was inside my worktrees): 8095 (1841311, wrapper 1841304),
  8097 (1713800, wrapper 1713789), 8093 (1493123). Left alone: PM2 on 4189 (production) and `dist/cli/main.js` on 8099
  (another tenant).
- After cleanup, 23:05:26: 1-minute load 2.19.
- Later I stopped two stalled measurement runs and their Chrome processes (identified by age and by the run they came
  from). None of mine remain.
- Measurement load: clean HEAD comparison 5.3 to 9.0; motion rounds 4.4 to 11.6. From 00:45 other tenants pushed load to
  20 to 40, so the gate in `paired.mjs` (wait for 1-minute load below 12) held runs. Final round loads 7.7 to 11.

## 5. Clean landing and demo, paired, n=5 per build (rc6 vs HEAD `32a0dce`, before Phase 3)

`qa/motion/phase3/clean-head/summary.json`

| page | metric | rc6 median [range] | HEAD median [range] |
|---|---|---|---|
| landing | TBT 5 s | 1172 [985–1742] | 655 [566–860] |
| landing | long task rank 1 | 394 [355–446] | 366 [351–459] |
| landing | long task rank 2 | 323 [206–439] | 252 [137–340] |
| landing | long task rank 3 | 212 [185–331] | 101 [78–150] |
| landing | scroll frames > 33 ms | 26 [13–40] | 16 [8–38] |
| demo | TBT 5 s | 717 [601–1035] | 1059 [592–1148] |
| demo | long task rank 1 | 337 [305–530] | 456 [331–530] |
| demo | scroll frames > 33 ms | 2 [1–5] | 1 [1–3] |

CLS is 0 on every run. Demo TBT is higher on HEAD by median, but the ranges overlap. I did not isolate the cause. The
header now has two extra layers on demo as well, so that is the first suspect. It is untested.

## 6. First-render profile (HEAD `32a0dce`, one trace per page, 390 px, 4x)

Landing, longest main-thread work in the first 5 s:

1. 348 ms at 490 ms: native layout and style. Inside it, a full-document `Layout` of 180 ms (93 layout objects, first
   layout) after `UpdateLayoutTree` of 67 ms (104 elements). The second `Layout` at 677 ms is 118 ms (72 dirty of 156).
2. 210 ms at 95 ms, native (parse and first paint work).
3. 199 ms at 2655 ms in `index.js`, of which 58 ms is an anonymous function (hydration).
4. 116 ms at 2900 ms: `appendChild`. 5. 110 ms at 3296 ms: `index.js` `bl` (React commit).

**Fonts.** With the `.woff2` files blocked, the first `Layout` drops from 180 ms to 85 ms, and the second from 118 ms to
101 ms. So about 95 ms of the first layout is font shaping, and about 85 ms is layout of the document itself.

**The 635 ms recalc from Phase 1b.** It does not appear in the first 5 s now: the case section mounts only within 300 px
of the viewport. It happens when the user scrolls near it. I did not isolate that scroll-time mount in this phase.

Demo (HEAD, one trace): 245 ms at 2310 ms in `index.js` (hydration); 195 ms at 452 ms, native (layout 152 ms, first
layout).

**Recommendation (not implemented; you asked for no change yet):**

1. Font shaping is the largest single item on the first layout (about 95 ms at 4x). Try a static Fraunces instance for the
   H1 (opsz pinned, fewer axes) and measure the first layout with the same fonts-blocked trace as the reference.
2. Measure the demo with the header's two layers removed. If the demo TBT gap closes, the layers are the cost, and a
   single layer with a precomputed surface would be the fix.
3. Hydration (`index.js`, 60 to 200 ms at 4x) is the next target: move non-hero landing code out of the entry chunk.

## 7. Phase 3 motion: what was built, measured, removed, kept

**Built and verified (then partly removed):**

- Scroll-driven reveal where view timelines exist (`animation-timeline: view()`, transform only), with an
  IntersectionObserver fallback, applied to the six landing sections and the demo's guided replay. The reveal starts after
  mount. It was verified in both modes: with the view timeline, all six blocks have an animation and are at rest after the
  scroll; with the timeline forced off, they get `is-in` through the observer, have no timeline animation, and are at rest.
  (`qa/motion/phase3/fallback-check.mjs`. It tests classes that are no longer in the code, so it is evidence only.)

**Measured, then removed:**

- Landing section reveals. Round 1, n=5 per build, loads 4.4 to 7.9, paired (`paired-scroll-with-landing-reveals`):
  frames over 33 ms, median 7 [5–10] for the baseline against 11 [10–21] for the build with reveals. The p95 worst case
  went from 17 to 33 ms. Removed.
- Demo replay reveal. Round 2 (`paired-scroll-no-landing-reveals-run2`), loads 6.4 to 11.6: demo frames over 33 ms went
  from median 2 [1–8] to 12 [0–30], and p95 from 17 to 33. Round 1 showed no demo difference (1 against 1). Removed,
  since the measured direction was worse.
- Round 2 also showed landing slightly worse without any scroll-time motion on the landing page (15 against 20 over
  33 ms). That is inside this machine's noise, but it means I cannot attribute landing differences to motion here.

**Kept:**

- Hero entrance, after mount, transform only. The `h1` is the LCP element, so only it moves, and it is visible at rest.
  The kicker stays static. Other hero blocks rise with 80, 160 and 220 ms delays. Under reduced motion it is off.
- Final build against the baseline (`paired-scroll-final`, n=5 per build, loads 7.7 to 11):

| page | metric | baseline median [range] | final median [range] |
|---|---|---|---|
| landing | frames over 33 ms | 22 [11–37] | 18 [9–25] |
| landing | p95 | 117 [17–617] | 33 [17–83] |
| demo | frames over 33 ms | 3 [1–20] | 0 [0–9] |
| demo | p95 | 17 [17–33] | 17 [17–17] |

  The baseline runs include a 617 ms p95 and a 27 s TBT outlier, so the noise is large. The final build is equal or better
  on every median. It does not worsen scroll frames.
- The hero entrance's own TBT cost (it runs in the first 1.2 s) is not isolated. Its scroll cost is not measured, since it
  is over before the scroll window starts.

**Reduced motion, final build** (`reduced-motion-final.json`): zero running motion at 500 and 1200 ms on landing, demo,
receipt, `/app` and the wizard at 390 and 1440. The only hidden text is the five landing rail labels, which are hidden by
design.

**Videos** (untracked, `qa/motion/phase3/videos/`, 12 MB in total, about 11.6 MB of it video): `base-landing-390.webm`,
`base-demo-390.webm`, `final-landing-390.webm`, `final-demo-390.webm`. Each is one scroll from the top to the bottom at
390 px. Base is `9984226`, final is the working tree with the hero entrance.

## 8. Open items

- The scroll-driven reveal code is reverted (not in the tree). The fallback check and its results are kept only as
  evidence.
- The demo TBT gap and the hero entrance's load-time cost are not isolated (see sections 5 and 7).
- Measurement quality: load moved from 5 to 40 during the session. With n=5 and per-run ranges this wide, I cannot resolve
  differences under about 100 ms in the tails.
