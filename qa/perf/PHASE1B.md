# Phase 1b results (V2.1), 2026-10-14

Builds compared: **rc6** = the live app code (`v2.0.0-rc6`, served locally from `$RELEASE_DIR` on :8097, and live at metricmotive.xyz for the traces); **v2.1** = branch `v2.1` head (served from this worktree on :8095). Same machine, same time, interleaved. Machine load during runs was 6 to 8 on 6 cores, so absolute Lighthouse scores are depressed; the comparison is what counts.

## (a) Profile (rc6, 390 px, CPU 4x, 5 s window): see `PROFILE.md`

- Landing: TBT 2038 ms in one trace (M0 median 2325 ms). Long-task time is mostly style and layout (about 930 ms) plus JavaScript (about 900 ms). Two full-document recalcs come from hydration and from the lazy section mount (413 ms, 635 ms at 4x).
- `/app`: TBT 1722 ms. JavaScript dominates: the entry bundle about 840 ms, and the WalletConnect/RainbowKit/wagmi bundle about 600 ms.
- Landing has no wallet code. Third-party cost on `/app` is the wallet SDK.

## (b) Fixes, before to after

| Item | rc6 | v2.1 | Evidence |
| --- | --- | --- | --- |
| Live backdrop-filter layers, landing 1440 peak | 7 | 1 | `qa/perf/fixes/before.json`, `after.json` |
| Backdrop layers, landing 390 peak | 1 | 1 | same |
| `elementFromPoint` calls per 4.8 kpx scroll (4x CPU) | 232 | 0 | `scroll-forced-layout.mjs` |
| Layouts per scroll | 8 | 1 | same |
| Style recalcs per scroll | about 101 | about 114 | same (cause not investigated) |
| Header height, top and scrolled | 69 / 68 px | 68 / 68 px | `before.json`, `after.json` |
| Layout transitions (header min-height, padding; rail max-width) | present | removed | `scripts/motion-props.test.mjs` (4 pass) |
| Blur in animation (rise-in, icon-swap) | present | removed | same test |
| Case cards on desktop | blur 16 px | translucent fill, no blur | pixel diff to check (see below) |

Pixel diff of the case section (1440, before vs after, with a 1 px offset from the header change): 56% of pixels differ, almost all by 8/255 or less (gradient banding). About 0.014% differ by more than 8, in two bands that look like text antialiasing. The maximum channel difference is 108. I have not checked those two bands side by side. **Please look at `qa/perf/fixes/after/landing-1440.png` against `before/` before approving.**

## (c) `/app` CLS, and the fix

Source found: the header brand link flips between one and two lines during font load, moving the page 15 px (CLS 0.0317, `qa/perf/brand-wrap.mjs`). Fixed with `whitespace-nowrap` on the link. A second, smaller shift came from body text reflowing when the web fonts arrive, which is fixed by metric-matched fallback faces (below).

## CLS on font swap (390 px, fonts delayed 1.5 s, median of 3; `qa/perf/cls-*.txt`)

| Page | rc6 (live) | v2.1 | Note |
| --- | --- | --- | --- |
| landing `/` | 0.0198 | 0.0001 | |
| receipt *(INVALID)* | 0.0343 | 0.0001 | *Invalid: measured on unseeded 404 page; real receipt CLS is 0.0000 on both rc6 and HEAD* |
| `/app` | 0.0457 | 0 | |
| `/demo` | 0.0219 | 0.0001 | |

Normal loads: 0 on every page at 1x and 4x (rc6 `/app` at 4x: 0.0317). Residual: the `/demo` heading "What the validators found" (28 px) wraps differently once Fraunces loads, which moves 0.0001. A single Fraunces ratio can't match both 28 px and 36 px headings exactly. I set it for 36 px, the size that causes the larger flip.

## (d) Lighthouse A/B (mobile, performance, 5 interleaved runs, medians; `qa/perf/lighthouse/`)

| Page | Build | Score | TBT ms | CLS | LCP ms | FCP ms | Speed Index ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| landing | rc6 | 75 | 682 | 0 | 2664 | 2123 | 4259 |
| landing | v2.1 | 79 | 767 | 0.0001 | 2230 | 1567 | 2868 |
| receipt *(INVALID)* | rc6 | 84 | 602 | 0.0002 | 2109 | 1309 | 2433 |
| receipt *(INVALID)* | v2.1 | 84 | 586 | 0 | 2070 | 1225 | 2441 |
*(Note: Receipt rows above marked INVALID — taken on unseeded "receipt not found" 404 page, not real receipt).*

- **Budget status:** the Lighthouse ≥90 target is **not met** on either build under this load. The landing TBT is **+85 ms** on median, which is over the +50 ms budget. The per-run range is wide (rc6 484 to 1187 ms, v2.1 356 to 1054 ms), so with five runs the difference is within noise, but I cannot claim the budget is met. LCP, FCP and Speed Index improved on the landing.
- To judge the ≥90 target and the TBT budget properly, these need a quieter machine or production hardware.

## Reduced motion gate (Phase 2 precondition), `qa/motion/reduced-motion-gate.mjs`, `scroll-active-check.mjs`

- Landing, demo, receipt, `/app` and the wizard (`/app/guards/new`), at 390 and 1440, with `prefers-reduced-motion: reduce`: 0 running animations or transitions over 20 ms at 500 ms and at 1200 ms. No text hidden by animation, except the five landing rail labels, which stay at opacity 0 until hover or focus (by design, as on rc6).
- Hover, desktop rail: label visible at once (opacity 1, transition about 10 µs).
- Scroll, desktop landing: the active rail link follows problem, case, how-it-works, audience, trust, with the same results on rc6 (CTA returns null on both, at the page end).
- **Gate: pass.**

## Type specimen (Phase 1), `qa/type/specimen/` (http://127.0.0.1:8093/specimen/index.html)

Bytes (ceiling 161,580 = current 141,580 + 20 kB):

| Candidate | First load | Total | Budget |
| --- | --- | --- | --- |
| A: Fraunces (opsz, wght) + Instrument Sans (wght) + Commit Mono | 91,804 | 122,992 | pass |
| A-SOFT: as A, Fraunces with SOFT | 140,776 | 171,964 | **fail** (+10,384) |
| A-WONK: as A, Fraunces with WONK | 92,068 | 123,256 | pass |
| B: Fraunces + Hanken Grotesk + IBM Plex Mono | 83,092 | 112,688 | pass |
| C: current families, variable Fraunces | 90,660 | 136,064 | pass |

Key facts:
- **SOFT is the budget cost.** It adds 48,972 bytes to the Fraunces file (61,788 to 110,760). WONK adds 264 bytes.
- **WONK is not visibly worth it.** I checked the crop myself (`qa/type/wonk-compare.png`): A and A-WONK look the same at 88 px and 32 px. I recommend dropping WONK, though the byte cost is trivial.
- **Swap CLS with fallbacks:** 0 for every candidate, against 0.0179 (A) and 0.0804 (C) without them. The candidate C fallback values are now in production `styles.css`.
- **Contrast:** the lowest pair is 5.19:1 (link ochre `#8a5a12` on bone), passing AA for normal and small text. Carbon and bone are about 16:1. Contrast does not change between candidates.
- **Tabular figures:** Fraunces has no working `tnum` in these subsets, so numbers set in the display face stay proportional for any candidate that uses Fraunces. Instrument Sans has `tnum`. Hanken Grotesk and Source Sans 3 are tabular by default. Commit Mono and IBM Plex Mono are monospaced.
- **Fallbacks:** Fraunces Fallback is tuned for 36 px headings; it is about 7% wider than Fraunces at 22 px and 36 px in the specimen run. The production value is 113.43%.

## Decisions needed

1. **Typography candidate:** A, B or C (see the table). A-SOFT is out of budget. I recommend dropping WONK in any case.
2. **Case-card blur (visual identity):** the case cards and the hero/CTA/replay glass cards lose their blur on desktop and keep a translucent fill. Please approve from the after screenshots.
3. **Header height:** now constant at 68 px (it was 69 px at the very top). This is effectively unchanged, so I'm treating it as approved unless you object.
4. **Lighthouse target:** ≥90 and the +50 ms TBT budget are not met under this load. Decide whether to accept this for Phase 2, or measure on a quieter machine.

## Phase 2 gate status

- Reduced motion on all four pages, the wizard, hover and scroll: **pass** (see above).
- No layout-property transitions and no blur animation: **pass** (`scripts/motion-props.test.mjs`). Paint transitions (background-color, box-shadow, border-color) remain on glass, buttons and cards, allowlisted, to be converted in Phase 2.
- Font-swap CLS: 0 normal, at most 0.0001 with fonts delayed.
