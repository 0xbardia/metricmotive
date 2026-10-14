// JS gzip total on the landing after scrolling the full page (every lazy section mounted). Read-only.
// Usage: node js-scrolled.mjs <baseUrl>
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
const require = createRequire("/root/mm-release-v2/node_modules/playwright");
const { chromium } = require("playwright");
const [BASE] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const js = new Map();
page.on("response", async (r) => { if (/\.m?js(\?|$)/.test(r.url()) && r.status() === 200) { try { js.set(r.url().split("/").pop().split("?")[0], await r.body()); } catch {} } });
await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
for (let y = 0; y <= 9000; y += 300) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(120); }
await page.waitForTimeout(3000);
const files = [...js.entries()].map(([f, b]) => ({ f, gz: gzipSync(b, { level: 9 }).length }));
console.log(JSON.stringify({ base: BASE, files: files.length, gzTotal: files.reduce((a, x) => a + x.gz, 0), top: files.sort((a, b) => b.gz - a.gz).slice(0, 6) }));
await browser.close();
