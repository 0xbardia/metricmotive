// Forced layouts during a scripted scroll of the desktop landing at 4x CPU: elementFromPoint calls and the engine's
// LayoutCount / RecalcStyleCount deltas. Usage: node scroll-forced-layout.mjs <baseUrl>. Read-only.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/root/mm-release-v2/node_modules/playwright");
const [base] = process.argv.slice(2);
const browser = await chromium.launch();
const runs = [];
for (let r = 0; r < 3; r++) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }); await cdp.send("Performance.enable");
  await page.addInitScript(() => { window.__efp = 0; const orig = document.elementFromPoint.bind(document); document.elementFromPoint = (...a) => { window.__efp++; return orig(...a); }; });
  await page.goto(base + "/", { waitUntil: "load", timeout: 120000 }); await page.waitForTimeout(4000);
  const m0 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  const efp0 = await page.evaluate(() => window.__efp);
  for (let i = 0; i < 40; i++) { await page.evaluate((y) => window.scrollTo(0, y), i * 120); await page.waitForTimeout(60); }
  await page.waitForTimeout(300);
  const m1 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  const efp = (await page.evaluate(() => window.__efp)) - efp0;
  runs.push({ elementFromPoint: efp, layouts: m1.LayoutCount - m0.LayoutCount, styleRecalcs: m1.RecalcStyleCount - m0.RecalcStyleCount });
  await ctx.close();
}
const med = (k) => runs.map((x) => x[k]).sort((a, b) => a - b)[1];
console.log(base, "scroll 4800 px, 40 steps, cpu 4x, median of 3:", JSON.stringify({ elementFromPoint: med("elementFromPoint"), layouts: med("layouts"), styleRecalcs: med("styleRecalcs") }), "runs:", JSON.stringify(runs));
await browser.close();
