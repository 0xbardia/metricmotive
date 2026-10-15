// Scroll-reveal paths. (a) Browser with view timelines: blocks get .reveal-scroll and an animation driven by view().
// (b) Forced fallback (CSS.supports says no timeline): blocks get .reveal-watching, then .is-in as they intersect.
// Both: after scrolling to the bottom, every reveal is at rest (transform none). Read-only. Usage: node fallback-check.mjs <baseUrl> <path>
import { createRequire } from "node:module";
const require = createRequire("/root/mm-release-v2/node_modules/playwright");
const { chromium } = require("playwright");
const [BASE, PATH = "/"] = process.argv.slice(2);
const b = await chromium.launch();
for (const [label, force] of [["view-timeline", false], ["io-fallback", true]]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  if (force) await p.addInitScript(() => { const orig = CSS.supports.bind(CSS); CSS.supports = (a, b) => (typeof a === "string" && a.includes("animation-timeline") ? false : orig(a, b)); });
  await p.goto(BASE + PATH, { waitUntil: "load", timeout: 120000 });
  await p.waitForTimeout(800);
  const before = await p.evaluate(() => ({ scroll: [...document.querySelectorAll(".reveal")].map((e) => e.className.replace("reveal", "").trim() || "-") }));
  for (let y = 0; y <= 9000; y += 300) { await p.evaluate((v) => window.scrollTo(0, v), y); await p.waitForTimeout(150); }
  await p.waitForTimeout(1500);
  const after = await p.evaluate(() => {
    const els = [...document.querySelectorAll(".reveal")];
    return { n: els.length, classes: els.map((e) => e.className.replace("reveal", "").trim() || "-"), restTransform: els.filter((e) => Math.abs(new DOMMatrix(getComputedStyle(e).transform === "none" ? undefined : getComputedStyle(e).transform).m42) > 0.5).length, animations: els.filter((e) => getComputedStyle(e).animationName !== "none").length };
  });
  console.log(label, JSON.stringify({ reveals: after.n, classesBeforeScroll: [...new Set(before.scroll)], classesAfterScroll: [...new Set(after.classes)], notAtRestAfterScroll: after.restTransform, withAnimation: after.animations }));
  await ctx.close();
}
await b.close();
