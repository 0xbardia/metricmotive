// Does the font preload finish before the LCP element paints? Per run: LCP time and element, and each woff2's
// request start and response end from the resource timing. Variants rewrite the server HTML in the browser only.
// Usage: node lcp-fonts.mjs <baseUrl> <outJson> [runs=3]
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire("/root/mm-release-v2/node_modules/playwright");
const { chromium } = require("playwright");
const [BASE, OUT, RUNS = "3"] = process.argv.slice(2);
const PRELOAD = /<link[^>]*rel="preload"[^>]*as="font"[^>]*>/g;
const browser = await chromium.launch();
const out = [];
for (const variant of ["built", "nopreload"])
  for (let i = 0; i < +RUNS; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    if (variant === "nopreload") await p.route(BASE + "/", async (route) => {
      const r = await route.fetch(); const body = (await r.text()).replace(PRELOAD, "");
      await route.fulfill({ response: r, body });
    });
    await p.addInitScript(() => { window.__lcp = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lcp.push({ t: e.startTime, el: e.element ? (e.element.textContent || "").trim().slice(0, 30) + " <" + e.element.tagName + ">" : "" }))).observe({ type: "largest-contentful-paint", buffered: true }); });
    await p.goto(BASE + "/", { waitUntil: "load", timeout: 120000 }); await p.waitForTimeout(3000);
    const r = await p.evaluate(() => {
      const last = window.__lcp[window.__lcp.length - 1];
      const fonts = performance.getEntriesByType("resource").filter((e) => /\.woff2/.test(e.name)).map((e) => ({ f: e.name.split("/").pop(), start: Math.round(e.startTime), end: Math.round(e.responseEnd) }));
      return { lcp: last ? Math.round(last.t) : null, el: last?.el ?? null, fonts };
    });
    const covered = r.fonts.filter((f) => f.f.startsWith("fraunces")).map((f) => f.end <= r.lcp);
    out.push({ variant, run: i, lcpMs: r.lcp, lcpEl: r.el, fraunces: r.fonts.find((f) => f.f.startsWith("fraunces")) ?? null, instrument: r.fonts.find((f) => f.f.startsWith("instrument")) ?? null, frauncesDoneBeforeLcp: covered[0] ?? null, load: (await Promise.resolve(0)) });
    await ctx.close();
  }
await browser.close();
writeFileSync(OUT, JSON.stringify(out, null, 1));
for (const row of out) console.log(row.variant, row.run, "LCP", row.lcpMs, JSON.stringify(row.lcpEl), "fraunces", JSON.stringify(row.fraunces), "instrument", JSON.stringify(row.instrument), "frauncesDoneBeforeLCP", row.frauncesDoneBeforeLcp);
