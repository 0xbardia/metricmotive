// Reduced-motion gate: with prefers-reduced-motion: reduce, no animation or transition over 20 ms keeps running
// after 1.2 s, content stays visible, and state changes still show (hover on the landing rail, active section on scroll).
// Usage: node reduced-motion-gate.mjs <baseUrl> [outFile]   (read-only GETs; no wallet, no writes)
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("/root/mm-release-v2/node_modules/playwright");
const [base, out] = process.argv.slice(2);
const browser = await chromium.launch();
const results = [];
const runningMotion = () => document.getAnimations().filter((a) => a.playState === "running" && (a.effect?.getComputedTiming().duration ?? 0) > 20).length;
async function openPage(vp, rate, path) {
  const ctx = await browser.newContext({ viewport: vp, reducedMotion: "reduce", isMobile: vp.width < 600, hasTouch: vp.width < 600 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  await page.goto(base + path, { waitUntil: "load", timeout: 120000 });
  return { ctx, page };
}
const pages = [
  ["landing", "/"], ["demo", "/demo"], ["receipt", "/verify/rct_14804bf62424284e"], ["app", "/app"], ["wizard", "/app/guards/new"],
];
for (const [name, path] of pages) for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  const { ctx, page } = await openPage(vp, 4, path);
  await page.waitForTimeout(500); const at500 = await page.evaluate(runningMotion);
  await page.waitForTimeout(700); const at1200 = await page.evaluate(runningMotion);
  const hidden = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.opacity === "0" && r.width > 0 && r.height > 0 && el.textContent?.trim()?.length > 0 && el.children.length === 0; }).length);
  const reveal = await page.evaluate(() => [...document.querySelectorAll('[class*="reveal"]')].filter((el) => getComputedStyle(el).opacity !== "1").length);
  results.push({ check: "page", page: name, width: vp.width, runningMotionAt500: at500, runningMotionAt1200: at1200, hiddenTextLeaves: hidden, revealNotVisible: reveal });
  await ctx.close();
}
// Hover on the landing rail (desktop): the label must still appear, instantly.
{
  const { ctx, page } = await openPage({ width: 1440, height: 900 }, 1, "/");
  await page.waitForTimeout(800);
  const link = page.locator(".landing-rail a").nth(1);
  await link.hover(); await page.waitForTimeout(50);
  const label = await page.evaluate(() => { const l = document.querySelector(".landing-rail a:hover .landing-rail-label") || document.querySelectorAll(".landing-rail-label")[1]; const cs = getComputedStyle(l); return { opacity: cs.opacity, transitionDuration: cs.transitionDuration, transform: cs.transform }; });
  results.push({ check: "hover-rail-label", ...label });
  await ctx.close();
}
// Scroll (desktop landing): the active section must still update, with no running motion.
{
  const { ctx, page } = await openPage({ width: 1440, height: 900 }, 1, "/");
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => document.querySelector(".landing-rail a[data-active='true'], .landing-rail a.active")?.textContent ?? null);
  await page.evaluate(() => document.getElementById("case")?.scrollIntoView({ behavior: "instant", block: "start" }));
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({ active: document.querySelector("[data-active='true']")?.id ?? null, motion: document.getAnimations().filter((a) => a.playState === "running" && (a.effect?.getComputedTiming().duration ?? 0) > 20).length }));
  results.push({ check: "scroll-active-section", before, ...after });
  await ctx.close();
}
await browser.close();
for (const r of results) console.log(JSON.stringify(r));
if (out) writeFileSync(out, JSON.stringify(results, null, 2));
