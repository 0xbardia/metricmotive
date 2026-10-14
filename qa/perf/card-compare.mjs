// Compare the layout of one card on /demo between "fallback only" (web fonts blocked) and "web fonts loaded". Read-only.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/root/mm-release-v2/node_modules/playwright");
const [url, sel] = process.argv.slice(2);
const browser = await chromium.launch();
const measure = async (block) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  if (block) await page.route("**/fonts/*.woff2", (route) => route.abort());
  await page.goto(url, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(3000);
  const out = await page.evaluate((s) => {
    const card = [...document.querySelectorAll(s)].find((el) => el.textContent.includes("Step 1 of 7")) || document.querySelector(s);
    const rows = [...card.querySelectorAll("*")].filter((el) => el.children.length === 0 && el.textContent.trim()).map((el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return `${el.tagName} ${cs.fontFamily.split(",")[0]} ${cs.fontSize} lh=${cs.lineHeight} h=${Math.round(r.height)} w=${Math.round(r.width)} "${el.textContent.trim().slice(0, 28)}"`; });
    return { cardH: Math.round(card.getBoundingClientRect().height), rows };
  }, sel);
  await ctx.close();
  return out;
};
const fallback = await measure(true);
const loaded = await measure(false);
console.log("card height: fallback", fallback.cardH, "loaded", loaded.cardH);
const n = Math.max(fallback.rows.length, loaded.rows.length);
for (let i = 0; i < n; i++) console.log(`F ${fallback.rows[i] ?? "-"}\nL ${loaded.rows[i] ?? "-"}`);
await browser.close();
