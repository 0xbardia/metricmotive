// CLS per page, 390x844, CPU 1x and 4x, normal fonts and fonts delayed 1.5 s; 3 runs, medians.
// Usage: node cls-check.mjs <baseUrl> [outFile]   (read-only GETs)
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("/root/mm-release-v2/node_modules/playwright");
const [base, out] = process.argv.slice(2);
const pages = ["/", "/verify/rct_14804bf62424284e", "/app", "/demo"];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const browser = await chromium.launch();
const rows = [];
for (const rate of [1, 4]) for (const delay of [0, 1500]) for (const p of pages) {
  const runs = [];
  for (let r = 0; r < 3; r++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    if (delay) await page.route("**/fonts/*.woff2", async (route) => { await new Promise((res) => setTimeout(res, delay)); await route.continue(); });
    await page.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); });
    await page.goto(base + p, { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(4000);
    runs.push(await page.evaluate(() => window.__cls));
    await ctx.close();
  }
  rows.push({ page: p, cpu: rate, fonts: delay ? "delayed1500" : "normal", median: +median(runs).toFixed(4), runs: runs.map((x) => +x.toFixed(4)) });
  console.log(p.padEnd(32), `cpu${rate}x`, (delay ? "delayed " : "normal  "), "median", median(runs).toFixed(4), JSON.stringify(runs.map((x) => +x.toFixed(4))));
}
await browser.close();
if (out) writeFileSync(out, JSON.stringify({ base, rows }, null, 2));
