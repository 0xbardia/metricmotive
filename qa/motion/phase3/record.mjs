// Playwright videos at 390 px (one scroll from top to bottom per page), for the baseline and the final build.
// Read-only GETs. Usage: node record.mjs <label> <baseUrl> <outDir>
import { createRequire } from "node:module";
import { renameSync } from "node:fs";
const require = createRequire("/root/mm-release-v2/node_modules/playwright");
const { chromium } = require("playwright");
const [label, BASE, OUT] = process.argv.slice(2);
const b = await chromium.launch();
for (const [name, path] of [["landing", "/"], ["demo", "/demo"]]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, recordVideo: { dir: OUT, size: { width: 390, height: 844 } } });
  const p = await ctx.newPage();
  await p.goto(BASE + path, { waitUntil: "load", timeout: 120000 });
  await p.waitForTimeout(2000);
  for (let y = 0; y <= 9000; y += 200) { await p.evaluate((v) => window.scrollTo(0, v), y); await p.waitForTimeout(120); }
  await p.waitForTimeout(1500);
  const vid = p.video();
  await ctx.close();
  renameSync(await vid.path(), `${OUT}/${label}-${name}-390.webm`);
  console.log("wrote", `${OUT}/${label}-${name}-390.webm`);
}
await b.close();
