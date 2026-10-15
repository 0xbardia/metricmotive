// Route entrance, runtime: (a) JavaScript disabled: wrapper at rest, no animation, fully visible; (b) JavaScript on:
// animations on the wrapper at first commit and after hydration, and the class added after mount. Read-only.
// Usage: node route-enter-check.mjs <baseUrl>
import { createRequire } from "node:module";
const require = createRequire("/root/mm-release-v2/node_modules/playwright");
const { chromium } = require("playwright");
const [BASE] = process.argv.slice(2);
const b = await chromium.launch();
const probe = () => {
  const w = document.querySelector(".route-enter");
  const cs = w && getComputedStyle(w);
  return { cls: w?.className ?? null, opacity: cs?.opacity ?? null, transform: cs?.transform ?? null, animations: document.getAnimations().filter((a) => a.effect?.target === w).length };
};
// (a) no JS
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
  console.log("no-JS", JSON.stringify(await p.evaluate(probe)));
  await ctx.close();
}
// (b) JS on: sample at first commit and 300 ms later
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const p = await ctx.newPage();
  await p.addInitScript(() => { window.__first = null; document.addEventListener("DOMContentLoaded", () => { window.__first = true; }); });
  await p.goto(BASE + "/", { waitUntil: "commit", timeout: 120000 });
  await p.waitForTimeout(150);
  const early = await p.evaluate(probe);
  await p.waitForLoadState("load");
  await p.waitForTimeout(1200);
  const late = await p.evaluate(probe);
  console.log("js-early", JSON.stringify(early));
  console.log("js-late ", JSON.stringify(late));
  await ctx.close();
}
await b.close();
