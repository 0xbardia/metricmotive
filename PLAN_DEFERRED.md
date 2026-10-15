# Deferred Optimizations & Research Backlog

This document tracks items deferred from the v2.1 performance and motion sprint, the empirical reasons they were deferred, and the exact preconditions required before re-attempting them.

**Status (2026-10-15):** v2.1.0-rc1 is deployed. The items below are unchanged by the deploy and stay deferred. Item 3 is new.

---

## 1. Landing View-Timeline Reveals & dApp Entrance Animations

### Status
Deferred until evaluation on a dedicated quiet benchmarking machine or production environment.

### Empirical Context
- On the multi-tenant development host (where background tenant load fluctuates between 5 and 25 on 6 cores), applying CSS `view-timeline` scroll reveals and entry animations consistently caused frame drops and TBT inflation:
  - Landing reveals increased TBT from 412–429 ms to 535 ms (+106 ms, exceeding the +50 ms budget).
  - dApp entrance on `/app` increased TBT from 625 ms to 960 ms (+335 ms) and degraded scroll frames >33ms from 8 to 11.
  - Receipt entrance increased TBT on the real receipt from 836 ms to 1177 ms (+341 ms).
- The implementation patches are preserved:
  - `qa/motion/phase4/dapp-entrance.patch`
  - `qa/motion/phase4/receipt-entrance.patch`

### Preconditions for Re-evaluation
1. Dedicated benchmarking machine or quiet window with machine load < 1.0 per core (load average < 6.0 on a 6-core machine).
2. Paired n=10 runs against production build output (`vite preview` or Vercel production preview).
3. Hard gate: TBT median must remain within +50 ms of baseline, and scroll frames >33ms must show statistically significant improvement.

---

## 2. The 635 ms Style/Layout Recalc & Below-Fold Mounting Strategy

### Status
Deferred. Current implementation uses `IntersectionObserver` with a 300px root margin (`Hold` component in `src/routes/index.tsx`).

### Empirical Context
- Analysis of 4x CPU throttled traces on landing page showed that mounting the full Case section (`#case`) requires styling 159 elements and executing layout for them.
- When mounted immediately at load, this creates a long task (~635 ms under heavy host load; ~120 ms under moderate load).
- In Phase 4/5, an idle-queue mounting strategy (`useIdleSections` with `requestIdleCallback`) was evaluated. While it successfully delayed mounting to ~3.4s, it still executed within the 5.0-second TBT measurement window, increasing landing TBT median from 570 ms to 951 ms (+381 ms).
- As long as TBT is measured over a 5-second window from navigation commit, executing style and layout for below-fold sections during `requestIdleCallback` counts against TBT if any user interaction is queued or if tasks exceed 50ms.

### Potential Future Directions
1. **Interaction-Triggered Mounting**: Mount off-screen sections only on user scroll initiation (e.g. `scroll` or `wheel` event listener with `passive: true`), bypassing the 5s TBT window entirely for stationary users.
2. **Post-5s Idle Queue**: Schedule `requestIdleCallback` with a minimum delay of 5000 ms so that initial vitals measurement completes before background section rendering begins.
3. **DOM Simplification**: Reduce the initial DOM node count of `#case` and `#how-it-works` by lazy-rendering inner technical tabs or code pre-blocks.

---

## 3. Receipt LCP: rc1 higher than rc6 (open, cause unknown)

### Status
Open. Deployed anyway after the operator confirmed the site; the difference is about 0.2 to 0.3 s on throttled mobile, with CLS 0.

### Empirical Context
- Lighthouse mobile on `/verify/rct_14804bf62424284e`, two interleaved rounds: LCP median 2236 ms [1856–2331] (rc6) against 2456 ms [2336–3051] (rc1) at load 4.2–7.2; 2325 ms [2189–4560, n=4] against 2633 ms [2271–3085] at load 9.4–12.0. Tables in `docs/MOTION.md` section 5.
- Same LCP element in both builds (text paragraph), fonts preloaded in both, no hiding rule. rc1 HTML +5 KB, inline CSS +4.8 KB.

### Preconditions for Re-evaluation
1. Quiet window, load below 1.0 per core; paired n=10.
2. Compare Lighthouse traces (FCP to LCP gap, main-thread work before first paint) for rc1 and rc6.
3. Real-domain PageSpeed medians for the receipt (HTML gzipped), 3 runs per strategy.

### Retry of item 1 (landing reveals, dApp and receipt entrance)
Same quiet-window gate as item 1; run it together with this item so one quiet window covers both. The patches are in `qa/motion/phase4/`.
