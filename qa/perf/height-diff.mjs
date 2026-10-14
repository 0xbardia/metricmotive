// Every element whose rendered height differs between "web fonts blocked" and "web fonts loaded" (390 px). Read-only.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/root/mm-release-v2/node_modules/playwright");
const [url] = process.argv.slice(2);
const browser = await chromium.launch();
const heights = async (block) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  if (block) await page.route("**/fonts/*.woff2", (route) => route.abort());
  await page.goto(url, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(3000);
  const out = await page.evaluate(() => [...document.querySelectorAll("body *")].map((el) => { const r = el.getBoundingClientRect(); return { k: el.tagName + "#" + [...el.parentElement?.children ?? []].indexOf(el) + " " + (el.className && typeof el.className === "string" ? el.className.slice(0, 40) : "") + " " + el.textContent.trim().slice(0, 36), h: Math.round(r.height), y: Math.round(r.top + scrollY) }; }));
  await ctx.close();
  return out;
};
const fb = await heights(true), ld = await heights(false);
const diffs = [];
for (let i = 0; i < Math.min(fb.length, ld.length); i++) if (fb[i].k === ld[i].k && Math.abs(fb[i].h - ld[i].h) > 2) diffs.push({ k: fb[i].k, fallback: fb[i].h, loaded: ld[i].h, y: fb[i].y });
console.log(`${url}: ${diffs.length} element(s) change height between fallback and loaded`);
for (const d of diffs.slice(0, 15)) console.log(JSON.stringify(d).slice(0, 220));
await browser.close();
