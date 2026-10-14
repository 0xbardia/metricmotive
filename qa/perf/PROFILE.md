# Phase 1b (a): main-thread profile, rc6 live site (2026-10-14)

Setup: Chrome trace (CDP Tracing with the CPU profiler and the stack category) at 390 px, CPU throttled 4x, page load then 5 s. Read-only GETs against https://metricmotive.xyz. The window for TBT is the first 5 s after navigationStart, the same window as the M0 measurements. Tools: `trace.mjs` (record), `analyze-trace.mjs` (attribute long tasks to scripts and to style, layout, paint and parse work), `layout-callers.cjs` (who forced each layout). Outputs: `profile-landing-390-4x.txt`, `profile-app-390-4x.txt`, `layout-callers-landing-390-4x-scroll.txt`.

Note on numbers: this trace run measured landing TBT 2038 ms. The M0 median was 2325 ms (three runs). Run-to-run variation at 4x is large, so treat single numbers as ±15%.

## Attribution by category

| Category (task) | Landing `/` | `/app` | Evidence |
| --- | --- | --- | --- |
| Hydration and boot (`index.js` entry, React commit) | 659 ms JS, plus the first full-document style and layout (413 ms, 256 ms of style) | 838 ms JS | JS samples by script; layout-callers shows React commits (`index.js` `Zi`, `bl`, `vl`) as the style invalidators |
| Route code (lazy section chunks mounting) | `routes.js` mounts the sections; `format.js` 197 ms in one task; a full-document recalc of 635 ms right after the case chunk mounts (t ≈ 4.4 s) | `routes` and `provider.js` 111 ms | layout-callers: `index.js` < `routes.js` < `clsx.js` before the 635 ms recalc |
| Third-party (wallet SDK) | none on landing (no WalletConnect, RainbowKit or wagmi requests or script) | `dist.js` 602 ms (WalletConnect, RainbowKit, wagmi) in the 5 s window | `dist.js` contains WalletConnect and wagmi strings; it is absent from the landing request list |
| CSS (style and layout size) | 436 ms style + 494 ms layout inside long tasks; the full-document passes touch 490 dirty objects | 160 ms style + 61 ms layout | `Layout` events: 4 full-document layouts >200 ms each in the first 5 s |
| Paint (backdrop-filter and glass) | 316 ms paint inside long tasks | 35 ms | desktop backdrop count is 7 (see `backdrop.mjs`); mobile 1 |
| Fonts | no main-thread cost in the window (fonts load off-thread); the swap is a layout shift, measured separately (CLS 0.02 to 0.03 with fonts delayed) | same | `qa/type/swap-cls.json` |
| Native (`(program)`) | 1411 ms, mostly style, layout and paint called from the engine (overlaps the categories above) | 638 ms | V8 sampled `(program)` frames |

Fonts are not a TBT cost on this trace. They are a CLS cost (see the type audit).

## Top 5 long tasks, landing `/` (390, 4x)

| # | Start | Duration | Source | Category |
| --- | --- | --- | --- | --- |
| 1 | 464 ms | 452 ms | engine (`(program)`) 451 ms, style 350 ms, paint 123 ms; first full-document style and layout while the entry bundle commits | hydration, CSS |
| 2 | 3430 ms | 424 ms | engine 414 ms, style and layout 348 ms; the lazy section chunks mount and the next full-document recalc (635 ms) follows | route code, CSS |
| 3 | 1462 ms | 345 ms | `index.js` anonymous function 132 ms, other entry-bundle functions | hydration |
| 4 | 1905 ms | 225 ms | `appendChild` 28 ms, the rest spread across entry-bundle functions during DOM insertion | hydration |
| 5 | 4269 ms | 220 ms | `format.js` function `t` 197 ms in a single task while a section renders | route code (investigate: a formatting helper doing 197 ms of work in one task) |

## Top 5 long tasks, `/app` (390, 4x)

| # | Start | Duration | Source | Category |
| --- | --- | --- | --- | --- |
| 1 | 3866 ms | 555 ms | `dist.js` function `CC` 122 ms (wallet SDK initialisation) and related wallet code | third-party (wallet SDK) |
| 2 | 841 ms | 429 ms | `index.js` anonymous function 100 ms (entry bundle) | hydration |
| 3 | 125 ms | 224 ms | engine 88 ms during the entry bundle's parse and compile | hydration |
| 4 | 2043 ms | 160 ms | `cn.js` function `w` 19 ms (class-merge helper called many times) | CSS or utility |
| 5 | 1523 ms | 117 ms | `index.js` update 13 ms (React update) | hydration |

## What this means for Phase 1b and Phase 2

- The landing's cost is layout and style, not JavaScript. Two full-document recalcs (413 ms, 635 ms at 4x) come from the hydration commit and from the lazy section mount. A motion change cannot fix that by itself. The fix is to keep the lazy mount from invalidating the whole document (a Phase 2 item).
- `/app` pays for the wallet SDK during the first 5 s (about 600 ms of JS). The dApp needs the wallet, but the SDK could load only when the wallet is first used. That is a route-code change and belongs in Phase 2, not in the motion work.
- Three cheap, known items from Phase 1b are in progress: the scroll-path forced layouts in the landing nav, the layout transitions on the header and rail, and the blur animation. None of them is a main cause of the load-time TBT above, but they add cost during scroll.
- Open: the 197 ms `format.js` task (#5 on the landing).
