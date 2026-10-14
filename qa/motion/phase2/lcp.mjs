// LCP element, its font, and LCP time on the landing with the font preloads as built, removed, or Fraunces only.
// Read-only GETs; the preload variants rewrite the HTML response in the browser only. Usage: node lcp.mjs <baseUrl> <outJson> [runs=3]
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire("/root/mm-release-v2/node_modules/playwright");
const { chromium } = require("playwright");
const [BASE, OUT, RUNS = "3"] = process.argv.slice(2);
const VARIANTS = { built: null, none: /<link[^>]*rel="preload"[^>]*as="font"[^>]*>/g, frauncesOnly: /<link[^>]*rel="preload"[^>]*as="font"[^>]*instrument-sans[^>]*>/g };
const VIEWPORTS = { mobile4x: { vp: { width: 390, height: 844 }, mobile: true, rate: 4 }, desktop1x: { vp: { width: 1440, height: 900 }, mobile: false, rate: 1 } };
const browser = await chromium.launch();
const out = [];
for (const [vname, rx] of Object.entries(VARIANTS))
  for (const [cname, c] of Object.entries(VIEWPORTS))
    for (let i = 0; i < +RUNS; i++) {
      const ctx = await browser.newContext({ viewport: c.vp, isMobile: c.mobile, hasTouch: c.mobile });
      const p = await ctx.newPage();
      const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setCPUThrottlingRate", { rate: c.rate });
      if (rx) await p.route(BASE + "/", async (route) => {
        const r = await route.fetch(); let body = await r.text();
        body = body.replace(rx, ""); await route.fulfill({ response: r, body, headers: { ...r.headers(), "content-length": String(Buffer.byteLength(body)) } });
      });
      await p.addInitScript(() => { window.__lcp = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lcp.push({ t: Math.round(e.startTime), el: e.element ? e.element.tagName + "." + (e.element.className?.toString().slice(0, 40) || "") + " \"" + (e.element.textContent || "").trim().slice(0, 40) + "\"" : null, size: e.size }))).observe({ type: "largest-contentful-paint", buffered: true }); });
      await p.goto(BASE + "/", { waitUntil: "load", timeout: 120000 }); await p.waitForTimeout(4000);
      const r = await p.evaluate(async () => {
        const last = window.__lcp[window.__lcp.length - 1] || null;
        const fam = last?.el ? (document.querySelector(last.el.split(" ")[0].replace(/\./g, ".")) || null) : null;
        const h1 = document.querySelector("h1");
        const fonts = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family + " " + f.weight);
        return { lcp: last, h1Font: h1 ? getComputedStyle(h1).fontFamily.split(",")[0] : null, loadedFaces: fonts, preloadTags: document.querySelectorAll('link[rel="preload"][as="font"]').length };
      });
      out.push({ variant: vname, viewport: cname, run: i, lcpMs: r.lcp?.t ?? null, lcpEl: r.lcp?.el ?? null, lcpSize: r.lcp?.size ?? null, h1Font: r.h1Font, loadedFaces: r.loadedFaces, preloadTags: r.preloadTags });
      await ctx.close();
    }
await browser.close();
writeFileSync(OUT, JSON.stringify(out, null, 1));
for (const row of out) console.log(row.variant, row.viewport, row.run, "LCP", row.lcpMs, row.lcpEl, "h1:", row.h1Font, "preloads:", row.preloadTags);
