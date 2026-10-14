// Font-swap CLS on the live site (read-only GETs). Normal load vs fonts delayed 1.5 s, 390 px, CPU 4x, median of 3.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("/root/mm-release-v2/node_modules/playwright");

const pages = { landing: "https://metricmotive.xyz/", receipt: "https://metricmotive.xyz/verify/rct_14804bf62424284e" };
const scenarios = { normal: 0, fontsDelayed1500ms: 1500 };
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const out = [];
const browser = await chromium.launch();
for (const [pageName, url] of Object.entries(pages)) {
  for (const [scenario, delay] of Object.entries(scenarios)) {
    const runs = [];
    for (let run = 1; run <= 3; run++) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      if (delay) await page.route("**/fonts/*.woff2", async (route) => { await new Promise((r) => setTimeout(r, delay)); await route.continue(); });
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await page.addInitScript(() => {
        window.__cls = 0; window.__shifts = [];
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(5) }); }
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(url, { waitUntil: "load", timeout: 90000 });
      await page.waitForTimeout(4000);
      const fontsReady = await page.evaluate(() => document.fonts.status);
      const res = await page.evaluate(() => ({ cls: window.__cls, shifts: window.__shifts }));
      runs.push({ run, cls: +res.cls.toFixed(5), shifts: res.shifts.length, topShifts: res.shifts.slice(0, 4), fontsStatus: fontsReady });
      await ctx.close();
    }
    out.push({ page: pageName, scenario, medianCls: +median(runs.map((r) => r.cls)).toFixed(5), runs });
    console.log(pageName, scenario, "median CLS", median(runs.map((r) => r.cls)).toFixed(5));
  }
}
await browser.close();
writeFileSync(new URL("./swap-cls.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("written qa/type/swap-cls.json");
