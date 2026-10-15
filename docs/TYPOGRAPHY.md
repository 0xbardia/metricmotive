# Typography System and Performance Rules

This document specifies the typography system for MetricMotive v2.1, including font faces, metric-matched fallbacks, layout shift (CLS) elimination, and optimization findings.

---

## 1. Type Families

All web fonts are self-hosted in `public/fonts/` (Open Font License):

| Role | Font Family | Files | Optical Sizes / Weights |
| --- | --- | --- | --- |
| **Display / Headings** | Fraunces | `fraunces-opsz-wght-400-700.woff2` | Variable (opsz 9–144, wght 400–700) |
| **Body & UI** | Instrument Sans | `instrument-sans-wght-400-700.woff2` | Variable (wght 400–700) |
| **Code & Monospace** | Commit Mono | `commit-mono-400.woff2`, `commit-mono-700.woff2` | 400 Regular, 700 Bold |

All `@font-face` declarations reside directly in `src/styles.css` using `font-display: swap`.

---

## 2. Metric-Matched Fallback System (Zero CLS)

To eliminate Cumulative Layout Shift (CLS) when fonts swap from the local OS fallbacks to downloaded web fonts, metric-matched `@font-face` fallbacks are configured using CSS `size-adjust` and font metric overrides:

### A. Fraunces Fallback
- **Target Face**: Times New Roman / Liberation Serif
- **Configuration**:
  ```css
  @font-face {
    font-family: "Fraunces Fallback";
    src: local("Times New Roman"), local("TimesNewRomanPSMT"), local("Liberation Serif");
    size-adjust: 113.43%;
    ascent-override: 78.21%;
    descent-override: 20.39%;
    line-gap-override: 0%;
  }
  ```
- **Tuning Size**: Tuned for 36 px headings (opsz 36, wght 400).

### B. Instrument Sans Fallback
- **Target Face**: Arial / Liberation Sans
- **Configuration**:
  ```css
  @font-face {
    font-family: "Instrument Sans Fallback";
    src: local("Arial"), local("ArialMT"), local("Liberation Sans");
    size-adjust: 102.14%;
    ascent-override: 94.97%;
    descent-override: 24.48%;
    line-gap-override: 0%;
  }
  ```

### Empirical CLS Results (390px, 4x CPU throttle, simulated 1.5s delayed font loading)
- **Landing `/`**: 0.0001 (down from 0.0198 on rc6)
- **Receipt `/verify/rct_14804bf62424284e`**: 0.0000 (verified on seeded real receipt)
- **App `/app`**: 0.0000 (down from 0.0457 on rc6)
- **Demo `/demo`**: 0.0001 (down from 0.0219 on rc6)
- **Normal Network Loads**: 0.0000 across all routes at 1x and 4x CPU throttling.

---

## 3. What Was Tried, Measured, and Rejected

### A. Static Fraunces Instance for the H1 Element
- **Hypothesis**: Generating a dedicated static Latin WOFF2 subset for the hero H1 (`SOFT 0`, `WONK 0`, `opsz 48`, `wght 600`, 17,920 B) to prevent initial variable font layout recalc.
- **Empirical Measurement**:
  - Variable font payload was still required for other headings, adding +18 KB transfer weight.
  - Layout time in the first 1.5 s across 4 interleaved traces:
    - HEAD: 114 ms to 200 ms
    - Static variant: 126 ms to 350 ms
  - Style recalc time was statistically indistinguishable.
- **Verdict**: REJECTED (no saving >= 50 ms).

### B. Moving Dependencies Out of Entry Chunk
- **Investigation**: Audited whether React, router, and query core could be further split from `index.js`.
- **Finding**: Entry bundle is ~123 KB gzip of core React 19 and TanStack router/query primitives. Landing page code outside the hero is already dynamically split (`routes` chunk 3.5 KB gzip; 5 sections lazy-loaded). Further fragmentation would degrade hydration waterfall without reducing execution time.
- **Verdict**: KEPT AS-IS.
