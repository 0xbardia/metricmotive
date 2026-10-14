// Header checks on the landing: live backdrop layers (390 and 1440), and the surface layers' opacity through a real
// tone flip (dark -> light) sampled every 60 ms. Read-only. Usage: node header-check.mjs <baseUrl>
import { createRequire } from "node:module";
const require = createRequire("/root/mm-release-v2/node_modules/playwright");
const { chromium } = require("playwright");
const [BASE] = process.argv.slice(2);
const b = await chromium.launch();
const bdCount = () => { let n = 0; const vh = innerHeight, vw = innerWidth; for (const e of document.querySelectorAll("*")) { const cs = getComputedStyle(e); const v = cs.backdropFilter || cs.webkitBackdropFilter; if (v && v !== "none") { const r = e.getBoundingClientRect(); if (r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw && r.width && r.height) n++; } } return n; };
for (const [name, vp, mobile] of [["mobile390", { width: 390, height: 844 }, true], ["desktop1440", { width: 1440, height: 900 }, false]]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "load", timeout: 120000 }); await p.waitForTimeout(2000);
  const bd = await p.evaluate(bdCount);
  console.log(name, "live backdrop layers in viewport at load:", bd);
  if (name === "desktop1440") {
    // find where the tone flips while scrolling down
    const flip = await p.evaluate(async () => {
      const tone = () => document.querySelector("header.site-header").dataset.tone;
      const start = tone(); const max = document.documentElement.scrollHeight;
      for (let y = 0; y < max; y += 40) { window.scrollTo({ top: y, behavior: "instant" }); await new Promise((r) => requestAnimationFrame(() => r())); if (tone() !== start) return { y, from: start, to: tone() }; }
      return null;
    });
    console.log("tone flip", JSON.stringify(flip));
    if (flip) {
      await p.evaluate((y) => window.scrollTo({ top: y - 40, behavior: "instant" }), flip.y);
      await p.waitForTimeout(700);
      const samples = await p.evaluate(async (y) => {
        const h = document.querySelector("header.site-header");
        const ops = () => ({ tone: h.dataset.tone, light: getComputedStyle(h, "::before").opacity, dark: getComputedStyle(h, "::after").opacity, bg: getComputedStyle(h).backgroundColor });
        const out = [{ t: 0, ...ops() }];
        window.scrollTo({ top: y, behavior: "instant" });
        const t0 = performance.now();
        while (performance.now() - t0 < 400) { await new Promise((r) => setTimeout(r, 60)); out.push({ t: Math.round(performance.now() - t0), ...ops() }); }
        return out;
      }, flip.y);
      console.log(samples.map((s) => `${s.t}ms tone=${s.tone} light=${s.light} dark=${s.dark}`).join("\n"));
    }
  }
  await ctx.close();
}
await b.close();
