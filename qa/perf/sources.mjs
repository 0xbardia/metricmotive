// (1) /app layout-shift sources at 390 px, CPU 1x and 4x. (2) backdrop-filter elements on landing at 1440 px while scrolling, CPU 4x.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/root/mm-release-v2/node_modules/playwright");
const browser = await chromium.launch();
const describe = (n) => `${n.nodeName.toLowerCase()}${n.className ? "." + String(n.className).trim().split(/\s+/).slice(0, 3).join(".") : ""}`;
// (1) CLS sources on /app
for (const rate of [1, 4]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  await page.addInitScript(() => { window.__ls = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__ls.push({ t: Math.round(e.startTime), v: +e.value.toFixed(5), src: (e.sources || []).map((s) => ({ node: s.node ? (s.node.nodeName + "." + (s.node.className || "")).slice(0, 120) : "?", prev: s.previousRect, cur: s.currentRect })) }); }).observe({ type: "layout-shift", buffered: true }); });
  await page.goto("https://metricmotive.xyz/app", { waitUntil: "load" }); await page.waitForTimeout(5000);
  const ls = await page.evaluate(() => window.__ls);
  console.log(`/app CPU ${rate}x: ${ls.length} shift(s), total ${ls.reduce((a, b) => a + b.v, 0).toFixed(4)}`);
  for (const s of ls) console.log("  t=" + s.t + " v=" + s.v, JSON.stringify(s.src).slice(0, 500));
  await ctx.close();
}
// (2) backdrop-filter elements on landing, desktop 1440, CPU 4x, while scrolling
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await page.goto("https://metricmotive.xyz/", { waitUntil: "load" }); await page.waitForTimeout(3000);
const total = await page.evaluate(() => document.documentElement.scrollHeight);
const seen = {};
for (let y = 0; y <= total; y += 300) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(120);
  const els = await page.evaluate(() => [...document.querySelectorAll("*")].filter((el) => { const cs = getComputedStyle(el); if (cs.backdropFilter === "none" && cs.webkitBackdropFilter === "none") return false; const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; }).map((el) => ({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 90), id: el.id, w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height), bf: getComputedStyle(el).backdropFilter.slice(0, 40) })));
  const key = JSON.stringify(els.map((e) => e.tag + "." + e.cls)); if (!seen[key] || seen[key].n < els.length) seen[key] = { n: els.length, y, els };
}
const peak = Object.values(seen).sort((a, b) => b.n - a.n)[0];
console.log(`landing 1440 backdrop peak at scrollY=${peak.y}: ${peak.n} element(s)`);
for (const e of peak.els) console.log("  ", JSON.stringify(e));
await browser.close();
