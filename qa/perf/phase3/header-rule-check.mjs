// Header bottom rule, scrolled, dark (landing) and light (demo): pixel rows 65 to 67 at several x positions for rc6, the
// previous build and the current build. Read-only. Usage: node header-rule-check.mjs <outJson> <rc6> <before> <after>
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire("/root/mm-release-v2/node_modules/playwright");
const { chromium } = require("playwright");
const [OUT, RC6, BEFORE, AFTER] = process.argv.slice(2);
const BUILDS = { rc6: RC6, before: BEFORE, after: AFTER };
const STATES = [["dark-landing", "/", 2600], ["light-demo", "/demo", 400]];
const XS = [4, 300, 720, 1436];
const ROWS = [65, 66, 67];
const b = await chromium.launch();
const out = {};
for (const [name, base] of Object.entries(BUILDS)) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  const p = await ctx.newPage();
  out[name] = {};
  for (const [st, path, y] of STATES) {
    await p.goto(base + path, { waitUntil: "load", timeout: 120000 });
    await p.waitForTimeout(800);
    await p.evaluate((yy) => window.scrollTo({ top: yy, behavior: "instant" }), y);
    await p.waitForTimeout(900);
    const shot = `/tmp/claude-0/-root-MetricMotive/835bf315-28c1-4f66-aa48-25a1be3f96e1/scratchpad/hdr-${name}-${st}.png`;
    await p.screenshot({ path: shot, clip: { x: 0, y: 0, width: 1440, height: 70 } });
    // Read the pixels in-page from the screenshot's canvas.
    const px = await p.evaluate(async ([src, xs, rows]) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      return rows.map((r) => xs.map((x) => { const d = g.getImageData(x, r, 1, 1).data; return [d[0], d[1], d[2]]; }));
    }, ["file://" + shot, XS, ROWS]).catch(() => null);
    out[name][st] = { shot, px };
  }
  await ctx.close();
}
await b.close();
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log("wrote", OUT);
