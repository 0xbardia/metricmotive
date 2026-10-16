# PageSpeed Insights after cut-over (human-run; the agent never calls it)

Run only after the cut-over is finished and `pm2 status` has been stable for several minutes. Never run it during
a deploy or restart: a cold or restarting process gives slow, misleading numbers.

## URLs
- https://metricmotive.xyz/ (landing)
- https://metricmotive.xyz/verify/rct_14804bf62424284e (receipt)

## Procedure
1. Strategies: `mobile` and `desktop`. Per URL and strategy, 3 runs, a minute apart. Record all 3 and the **median**.
2. Web UI: https://pagespeed.web.dev, paste the URL, switch the Mobile/Desktop tab, read Performance, Accessibility,
   Best Practices, SEO, and CLS.
3. Or the public API (no key needed for a few calls; repeat with `strategy=desktop`):
   `curl -s 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https%3A%2F%2Fmetricmotive.xyz%2F&strategy=mobile&category=performance&category=accessibility&category=best-practices&category=seo' | jq '{perf:.lighthouseResult.categories.performance.score, a11y:.lighthouseResult.categories.accessibility.score, bp:.lighthouseResult.categories["best-practices"].score, seo:.lighthouseResult.categories.seo.score, cls:.lighthouseResult.audits["cumulative-layout-shift"].numericValue}'`
   (scores are 0-1; multiply by 100.)
4. Also note the field-data panel ("Discover what your real users experience"), if it appears; it is empty for a new site.

## Baseline (rehearsal, Lighthouse mobile, local, under load)
- Receipt page: median 90 (range 83-96).
- Landing: median 86 (range 76-89).
- Accessibility, Best Practices, SEO: 100. CLS: 0.
- **Target: landing >= 90 on real hardware** (the rehearsal ran under CPU load, so real runs should score higher).

## Record in $REPORT_DIR/FINAL_REPORT.md
A table per URL: strategy, run 1-3, median performance, accessibility, best practices, SEO, CLS, plus the date/time.
State pass/fail against the target (landing mobile median >= 90; a11y/BP/SEO stay 100; CLS stays 0) and link or quote
any audit that regressed (LCP, TBT, unused JS).

## Caveats
Lab scores vary by several points run to run (the rehearsal range was 13 points). Judge the median, not one run. A single
low run is noise; a median below target, or any drop in accessibility/best practices/SEO, is a finding to investigate.
