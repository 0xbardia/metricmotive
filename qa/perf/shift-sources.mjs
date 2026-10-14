// Layout-shift sources for one page with fonts delayed 1.5 s. Usage: node shift-sources.mjs <url> <cpuRate>
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/root/mm-release-v2/node_modules/playwright");
const [url, rate = "1"] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(rate) });
await page.route("**/fonts/*.woff2", async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
await page.addInitScript(() => { window.__ls = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__ls.push({ t: Math.round(e.startTime), v: +e.value.toFixed(5), src: (e.sources || []).map((s) => ({ node: s.node ? (s.node.nodeName + "." + String(s.node.className || "").slice(0, 80) + " " + (s.node.textContent || "").trim().slice(0, 50)) : "?", prev: s.previousRect && Math.round(s.previousRect.height), cur: s.currentRect && Math.round(s.currentRect.height), y: s.currentRect && Math.round(s.currentRect.top) })) }); }).observe({ type: "layout-shift", buffered: true }); });
await page.goto(url, { waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(4000);
const ls = await page.evaluate(() => window.__ls);
console.log(`${url} cpu${rate}x delayed fonts: ${ls.length} shift(s), total ${ls.reduce((a, b) => a + b.v, 0).toFixed(4)}`);
for (const s of ls) { console.log(`  t=${s.t} v=${s.v}`); for (const x of s.src) console.log("    ", JSON.stringify(x)); }
const fontInfo = await page.evaluate(() => [...document.fonts].map((f) => `${f.family} ${f.style} ${f.weight} ${f.status}`));
console.log("fonts:", fontInfo.join(" | "));
await browser.close();
