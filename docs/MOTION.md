# Motion Architecture and Performance Rules

This document records the motion system, design tokens, performance invariants, and empirical benchmark findings for MetricMotive v2.1.

---

## 1. Design Tokens

All motion values are defined as CSS custom properties in `src/styles.css`:

```css
/* Durations */
--motion-stagger: 64ms;
--motion-micro: 100ms;
--motion-quick: 180ms;
--motion-fast: 280ms;
--motion-glass: 280ms;
--motion-medium: 360ms;
--motion-slow: 520ms;
--motion-emphasis: 640ms;

/* Displacements (Y-axis only) */
--motion-y-micro: 4px;
--motion-y-small: 6px;
--motion-y-base: 8px;
--motion-y-medium: 16px;

/* Easing */
--ease-out-soft: cubic-bezier(0.16, 1, 0.3, 1);
```

---

## 2. Invariants & Rules

1. **Transform and Opacity Only**:
   - Transitions and animations must never animate layout properties (`width`, `height`, `padding`, `margin`, `top`, `bottom`, `left`, `right`, `contain-intrinsic-size`) or graphical filter properties (`filter`, `backdrop-filter`, `blur`).
   - Allowed paint properties for color transitions: `background-color`, `box-shadow`, `border-color`, `color`, `fill`, `stroke`.
   - Verified by automated regression tests in `scripts/motion-props.test.mjs`.

2. **Zero Initial-Paint Cost (No SSR/First-Paint Opacity Fades)**:
   - Elements rendered on server-side or on first paint must never fade in from `opacity: 0`. Doing so suppresses First Contentful Paint (FCP) and Largest Contentful Paint (LCP) in Chromium (reporting `NO_FCP`).
   - Route and hero entrance animations must apply post-hydration via class switches (`useEntering` / `RouteEnter`), strictly transforming along the Y axis.
   - Banners (`.product-status`) must not execute entrance animations on initial page load; state-change transitions are restricted to opacity fades.

3. **Strict Reduced Motion (`prefers-reduced-motion: reduce`)**:
   - All animations and transitions are clamped to `0.01ms !important`.
   - All hover/active transforms are reset to `none !important`.
   - CSS View Transitions navigation is disabled (`navigation: none`).
   - Verified by `qa/motion/reduced-motion-gate.mjs` (0 running animations >20ms at 500ms and 1200ms across all 5 routes at 390px and 1440px viewports).

4. **Reduced Transparency (`prefers-reduced-transparency: reduce`)**:
   - `-webkit-backdrop-filter` and `backdrop-filter` are set to `none`.
   - Translucent glass backgrounds (`.glass`, `.glass-dark`, `.site-header`) fallback to solid opaque colors (`var(--glass-bg-bone-solid)`, `var(--glass-bg-carbon-solid)`).

---

## 3. What Was Tried, Measured, and Removed

To prevent repeating failed experiments, the following candidates were rigorously measured using paired n=5 runs under CPU throttling (390px viewport, 4x CPU throttle) and rejected:

### A. Landing View-Timeline Reveals (`qa/motion/phase4/exp2b-idle-reveals`)
- **Hypothesis**: Gradual CSS view-timeline entrance reveals on below-the-fold sections would improve perceived scroll polish.
- **Findings**:
  - Landing TBT regressed from 412–429 ms (HEAD) to 535 ms (+106 ms penalty).
  - Exceeded the allowable TBT budget (+50 ms).
- **Verdict**: REJECTED and removed.

### B. dApp Route & Step Entrance (`qa/motion/phase4/paired-dapp`)
- **Hypothesis**: Transform-only staggered entrance on `/app` and the Guard creation wizard.
- **Findings**:
  - `/app` TBT regressed from 625 ms [614–1041] to 960 ms [867–1019] (+335 ms).
  - `/app` scroll frames >33ms regressed from 8 [5–12] to 11 [8–14].
  - Wizard frames >33ms regressed from 7 [4–27] to 12 [5–21].
- **Verdict**: REJECTED. Preserved in `qa/motion/phase4/dapp-entrance.patch`.

### C. Receipt Entrance Motion (`qa/motion/phase4/paired-receipt`)
- **Hypothesis**: Staggered post-hydration entrance (`receipt-entrance.patch`) on the public receipt page (`/verify/$receiptId`).
- **Findings** (tested on seeded real D1 receipt `rct_14804bf62424284e` against dedicated Postgres container):
  - TBT regressed from 836 ms [763–1431] to 1177 ms [801–1638] (+341 ms).
  - 4-second frames >33ms regressed from 7 [6–11] to 8 [6–13].
  - Scroll frames >33ms regressed from 2 [2–8] to 6 [0–12].
- **Verdict**: REJECTED. Patch kept in `qa/motion/phase4/receipt-entrance.patch`.

### D. Idle-Only Mounting of Below-Fold Sections (`qa/motion/phase5/idle-mount`)
- **Hypothesis**: Sequentially mounting lazy below-fold sections during `requestIdleCallback` (2s timeout) to avoid scroll jank.
- **Findings**:
  - Landing TBT regressed from 570 ms [417–716] to 951 ms [835–1165] (+381 ms).
  - Failed the rule that TBT median must stay within +80 ms of HEAD.
  - Scroll frames >33ms did not improve (15 vs 14).
- **Verdict**: REJECTED. Reverted back to viewport intersection observation (`Hold` with 300px root margin).

### E. Unconditional Banner Mount Animation
- **Hypothesis**: Adding `@keyframes banner-enter` directly to `.product-status`.
- **Findings**: Static banner on receipt page executed animation on SSR hydration, increasing receipt TBT from 656 ms to 915 ms (+259 ms).
- **Verdict**: REFINED. Removed mount animation from `.product-status`; kept opacity-only state transitions. Receipt TBT restored to 670 ms (matching HEAD's 636 ms).

---

## 4. Kept Zero-Cost Motion Implementations

1. **Button & Card Hover/Press**:
   - `.paper-panel[role="button"]`, `a.paper-panel`, `button.paper-panel`: `translateY(-2px)` on hover, `scale(0.995)` on active.
   - `.mm-button`: `translateY(-1px)` on hover, `scale(0.99)` on active.
   - Zero cost at page load; hardware accelerated via GPU composite layers.

2. **State-Change Fades**:
   - Pure opacity transition (`var(--motion-quick) var(--ease-out-soft)`) on `.product-status`, `.state-card`, `[role="tabpanel"]`, `.tab-content`, `[data-state]`.
   - Never triggers layout or paint recalculations outside the composite layer.

3. **CSS View Transitions for Route Navigation**:
   - Guarded under `@supports (view-transition-name: root)`.
   - Subtle cross-fade (`fade-out` / `fade-in`) across SPA route transitions.
   - Degrades gracefully on unsupported browsers without any JS polyfill.

4. **Dialog Entry Animation**:
   - `[role="dialog"]`, `[role="alertdialog"]`: `dialog-enter` scale and translate animation.
   - Only triggered upon explicit user action (e.g. confirming empty evidence submission); 0ms cost on route load.

---

## 5. Deployment and Receipt LCP (v2.1.0-rc1, deployed 2026-10-15)

`v2.1.0-rc1` (`483cf2c`) went live on 2026-10-15. Deploy 22:25:55 to 22:26:08 UTC (13 s, `mm-deploy-v21.sh`); PM2 restart counter 0 to 1, exactly one restart; `/api/v1/ready` chain 61997, contract `0x4105…8703`; `cutover-verify` PASS on the live domain. No rollback.

Pre-deploy checks on the freshly built output (Node 22.23.3, `nodejs22.x`, like production's rc6 output): `tests/e2e` 14/14, `cutover-verify` PASS on a local preview, reduced-motion gate unchanged (0 running motion on 10 page/viewport cases).

### Open: receipt LCP is higher than rc6
Lighthouse mobile, `/verify/rct_14804bf62424284e`, seeded Postgres container, interleaved:

| Round (load, 6 cores) | Build | Score | FCP ms | TBT ms | LCP ms | CLS |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (4.2 to 7.2), n=5 | rc6 | 74 [71–81] | n/a | 1219 [649–1555] | 2236 [1856–2331] | 0 |
| 1 | rc1 | 78 [60–87] | n/a | 753 [153–2081] | 2456 [2336–3051] | 0 |
| 2 (9.4 to 12.0), rc6 n=4 (one run skipped at load 16.3) | rc6 | 69 [48–72] | 2062 [1627–3260] | 1592 [1373–4294] | 2325 [2189–4560] | 0 |
| 2, rc1 n=5 | rc1 | 66 [57–72] | 2575 [1782–2986] | 1618 [1136–2754] | 2633 [2271–3085] | 0 |

rc1's LCP median is +220 ms (round 1) and +308 ms (round 2) over rc6. Direction is consistent, size is within rc6's own spread in round 2. **Cause not found; nothing changed.**

What was ruled out: the LCP element is the same in both builds (the first list item's paragraph, text only, no resource); its font is preloaded and loaded in both (rc1 Instrument Sans, rc6 Source Sans 3); no entrance or opacity rule hides it; CLS is 0. Size: rc1's HTML is 106,214 B against 101,275 B and its inline CSS 63,765 B against 58,937 B (+5 KB each, uncompressed on the preview), and its font payload for the page is about 4 KB smaller. In both rounds rc1's LCP lands later after its FCP (median gap about 560 ms against 160 ms in round 1).

Next: a Lighthouse trace comparison on a quiet machine (load below 1.0 per core), then PageSpeed on the real domain (`scripts/pagespeed-post.md`), where the HTML is gzipped.

### Provenance
Commits up to `d3ae839` carry the Haiku 5.5 trailer, from the earlier model; commits from `f37719f` on carry Sonnet 5.5 (see `qa/motion/phase4/PHASE4.md`).
