// Scroll the desktop landing with reduced motion on and report which rail link is active at each section. Read-only.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("/root/mm-release-v2/node_modules/playwright");
const [base] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const page = await ctx.newPage();
await page.goto(base + "/", { waitUntil: "load" }); await page.waitForTimeout(1000);
const active = () => page.evaluate(() => { const a = document.querySelector(".landing-rail a[data-active='true'], .landing-rail a[aria-current='true'], .landing-rail a.active"); return a ? (a.getAttribute("href") || a.textContent.trim()) : null; });
const seen = [];
for (const id of ["problem", "case", "how-it-works", "audience", "trust", "cta"]) {
  await page.evaluate((i) => document.getElementById(i)?.scrollIntoView({ behavior: "instant", block: "center" }), id);
  await page.waitForTimeout(400);
  seen.push(`${id} -> ${await active()}`);
}
console.log(seen.join("\n"));
await browser.close();
