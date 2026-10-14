// Crop the A and A-WONK heading comparison from the type specimen at 2x. Read-only, local server on 8093.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/root/mm-release-v2/node_modules/playwright");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto("http://127.0.0.1:8093/specimen/index.html", { waitUntil: "load" });
await page.waitForTimeout(1500);
const cmp = page.locator(".wonkcmp").first();
const n = await cmp.count();
console.log("wonkcmp blocks:", n);
if (n) await cmp.screenshot({ path: "/root/MetricMotive-v2.1-wt/qa/type/wonk-compare.png" });
await browser.close();
