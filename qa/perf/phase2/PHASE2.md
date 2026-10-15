# Phase 2 report (v2.1), 390 px, 4x CPU unless stated

Machine load was 10 to 22 on 6 cores during the measurements (the other tenants on this box). Paired runs
interleave rc6 (`/root/mm-release-v2`, :8097) and v2.1 (this worktree, :8095). Lighthouse is not part of this gate.

## Header (opacity-only)

- Two surface layers per tone (`::before` light, `::after` dark), opacity only. Tone flips crossfade in about 300 ms
  (`qa/motion/phase2/header-check.mjs`). Scrolled state is opacity on the same layers; the bottom rule is a
  `currentColor` span at 12% opacity.
- Live backdrop layers: 1 at 390 and at 1440 at load (the header). The layers have no backdrop-filter.
- Background pixels against rc6 (`qa/perf/fixes/review`, sampled without glyphs): at rest the difference is 0 to 2
  levels away from the glow, and up to 6 to 8 levels in the bright glow at the top-left edge. Scrolled bottom rule is
  about 2x as strong as rc6's border line, because the inset ring of the layer also paints the last row.

## Hero glass card, pixel sample against rc6 (1440, background-only points)

Luminance (rc6 to v2.1): 43.6 to 43.6, 28.4 to 29.6, 26.4 to 27.4, 34.6 to 34.6, 23.4 to 23.4, 27.5 to 27.8,
23.6 to 23.6, 23.4 to 23.4, 23.4 to 23.4. Largest difference is +1.2 levels. Whole-card mean difference of 5.2 includes
glyphs, which changed with the typeface.

## TBT first

- Below-the-fold sections mount when within 300 px (`IntersectionObserver`, `routes/index.tsx` `Hold`), and each
  placeholder keeps its height through `contain-intrinsic-size`. Offscreen sections skip style and layout
  (`content-visibility: auto`).
- `formatUtc` no longer constructs `Intl.DateTimeFormat` (cold construction is about 32 ms unthrottled, over 100 ms
  at 4x). Parity with Intl is checked across a decade in `src/lib/format.test.ts`.
- Paired landing runs (5 each, `qa/motion/phase2/paired/`):

| | rc6 | v2.1 |
|---|---|---|
| TBT 5 s, median | 1447 ms (1286 to 1736) | 1006 ms (734 to 1097) |
| Long task rank 1, median | 501 ms | 417 ms |
| Long task rank 2, median | 364 ms | 299 ms |
| Long task rank 3, median | 269 ms | 222 ms |
| Scroll frames over 33 ms | 31 to 42 | 25 to 32 |
| Scroll frame p95 | 33 to 67 | 50 to 67 |
| CLS (4x) | 0 (one run 0.0195) | 0 |

- What is left in the top tasks (`analysis-*.txt`): the first render (style and layout of about 300 elements, two full
  document layouts of 55 and 70 ms at 4x) and the entry module's evaluation (about 170 ms at 4x). Neither is fixed here.
- The 635 ms full-document recalc in rc6 came from mounting the case section. It no longer happens in the first 5 s at
  load; it happens when the user scrolls near it. No `:has()`, `~`, or root-level class writes were found in the
  source.

## LCP and font preload

- The LCP element on the landing is the H1 (Fraunces) on desktop and on most mobile runs.
  With both preloads, the Fraunces file finishes at 375 to 513 ms, before the H1 paints at 776 to 1056 ms
  (`lcp-fonts-v21.json`).
- Without the preloads, the LCP element switches to the first paragraph (Instrument Sans). The Fraunces file then
  finishes at 987 to 1436 ms, after the LCP.
- LCP medians (3 runs, mobile 4x): with preloads 1008 ms (H1); without 848 ms (paragraph, painted in fallback).
  The lower number without preloads is a different element, not a faster headline. The preloads stay (2 of max 2).
  Instrument Sans' preload was not isolated from Fraunces' in this sample.

## Gate

| Item | Result |
|---|---|
| Reduced motion, landing, demo, receipt, /app, wizard, 390 and 1440 | pass: 0 running motion at 500 and 1200 ms; scroll-active OK (`reduced-motion-phase2.json`, `scroll-active-check`). *(Phase 2 receipt row was on unseeded 404; re-verified on real seeded receipt: pass)* |
| CLS 0 at 4x: landing, /app, demo, receipt (3 runs each) | pass: 0 everywhere (`cls4x-v21.json`). *(Phase 2 receipt row was on unseeded 404; re-verified on real seeded receipt: 0.0000 on 3/3 runs)* |
| /app 0.032 source | closed: rc6's brand-link wrap, fixed by `whitespace-nowrap` (Phase 1b). v2.1 /app is 0 in 3 runs |
| Landing long tasks lower than rc6's top 3 | pass, rank by rank, in paired runs, under load 21. Per-run ranges overlap, so treat as directional |
| JS growth under 5 kB gzip, after a full scroll | pass: 168,394 to 169,080 B gzip (+686 B) (`js-scrolled`) |
| No wallet or chain code on landing, demo, receipt | pass: none found in any loaded JS (`js-v21.json`); /app keeps its wallet chunks. *(Re-verified on real seeded receipt: 15 files, 165.9 KB gz, wallet: none)* |

## Not done / decisions for you

- `.route-enter` (existing CSS animation on the route wrapper) starts at first paint, before hydration. It is not new
  motion, so it is unchanged. Gate it on hydration if you want the post-hydration rule applied to it.
- No new entrance motion was added this phase.
- Rank-1 long task is the first render. Reducing it means changing the hero's first-render cost (style and layout
  of about 300 elements), which is a bigger change than this phase covered.
