// Header brand link height over time on /app at 390 px, CPU 1x (read-only GET).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/root/mm-release-v2/node_modules/playwright");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto("https://metricmotive.xyz/app", { waitUntil: "commit" });
const samples = [];
for (let i = 0; i < 30; i++) { samples.push(await page.evaluate(() => { const a = document.querySelector("header a"); const r = a?.getBoundingClientRect(); return { h: r ? Math.round(r.height) : null, w: r ? Math.round(r.width) : null, fonts: document.fonts.status, hasHeader: !!a, text: a?.textContent?.trim().slice(0, 30) }; }).catch(() => ({ err: 1 }))); await page.waitForTimeout(150); }
console.log(JSON.stringify(samples.filter((s, i, arr) => i === 0 || JSON.stringify(s) !== JSON.stringify(arr[i - 1]))));
await browser.close();
