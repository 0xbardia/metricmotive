// Elements with a live backdrop-filter, landing at 1440 px, CPU 4x, sampled while scrolling. Read-only GETs.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/root/mm-release-v2/node_modules/playwright");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await page.goto("https://metricmotive.xyz/", { waitUntil: "load" }); await page.waitForTimeout(3000);
const total = await page.evaluate(() => document.documentElement.scrollHeight);
let peak = { n: -1 };
for (let y = 0; y <= total; y += 300) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(150);
  const els = await page.evaluate(() => [...document.querySelectorAll("*")].filter((el) => { const bf = getComputedStyle(el).backdropFilter; if (!bf || bf === "none") return false; const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0 && r.height > 0; }).map((el) => ({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 80), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height), top: Math.round(el.getBoundingClientRect().top), bf: getComputedStyle(el).backdropFilter.slice(0, 36) })));
  if (els.length > peak.n) peak = { n: els.length, y, els };
}
console.log(`landing 1440 peak backdrop-filter elements in viewport: ${peak.n} at scrollY=${peak.y}`);
for (const e of peak.els) console.log("  ", JSON.stringify(e));
await browser.close();
