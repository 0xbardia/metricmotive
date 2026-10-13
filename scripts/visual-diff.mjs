#!/usr/bin/env node
/**
 * Pixel diff between two served builds of the same pages (same database behind both).
 *   node scripts/visual-diff.mjs <beforeBase> <afterBase> <path> [<path> ...] [--widths=390,1440] [--out=dir] [--threshold=0.02]
 * Animations/transitions are disabled and the page is scrolled to the bottom (lazy sections) before each full-page
 * screenshot. Reports the percentage of pixels that differ (any channel by more than 8/255) and, for pages over the
 * threshold (percent), writes before/after/diff images. Exit code 1 if any page is over the threshold or the page
 * heights differ.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const args = process.argv.slice(2);
const opt = (n, d) => (args.find((a) => a.startsWith(`--${n}=`)) ?? "").split("=")[1] ?? d;
const widths = opt("widths", "390,1440").split(",").map(Number); const out = opt("out", "/tmp/visual-diff"); const threshold = Number(opt("threshold", "0.02"));
const [before, after, ...paths] = args.filter((a) => !a.startsWith("--"));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(); let bad = 0;
async function shot(base, path, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" }); const page = await ctx.newPage();
  await page.addInitScript(() => { const s = document.createElement("style"); s.textContent = "*,*::before,*::after{animation:none !important;transition:none !important;caret-color:transparent !important}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
  await page.goto(base + path, { waitUntil: "networkidle" }); await page.evaluate(() => document.fonts.ready);
  const H = await page.evaluate(() => document.body.scrollHeight); for (let y = 0; y < H; y += 500) { await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(90); }
  await page.waitForLoadState("networkidle"); await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(500);
  const buf = await page.screenshot({ fullPage: true }); await ctx.close(); return buf;
}
const dp = await browser.newPage();
for (const width of widths) for (const path of paths) {
  const [a, b] = [await shot(before, path, width), await shot(after, path, width)];
  const r = await dp.evaluate(async ([x, y]) => {
    const load = async (b64) => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); return i; };
    const [ia, ib] = [await load(x), await load(y)];
    if (ia.height !== ib.height || ia.width !== ib.width) return { sizeDiffer: [ia.width + "x" + ia.height, ib.width + "x" + ib.height] };
    const ca = Object.assign(document.createElement("canvas"), { width: ia.width, height: ia.height }), cb = Object.assign(document.createElement("canvas"), { width: ib.width, height: ib.height });
    const xa = ca.getContext("2d"), xb = cb.getContext("2d"); xa.drawImage(ia, 0, 0); xb.drawImage(ib, 0, 0);
    const da = xa.getImageData(0, 0, ia.width, ia.height), db = xb.getImageData(0, 0, ib.width, ib.height);
    const diff = xb.createImageData(ib.width, ib.height); let n = 0, minY = 1e9, maxY = -1;
    for (let i = 0; i < da.data.length; i += 4) {
      const d = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2]));
      const y = Math.floor(i / 4 / ia.width);
      if (d > 8) { n++; minY = Math.min(minY, y); maxY = Math.max(maxY, y); diff.data[i] = 255; diff.data[i + 1] = 0; diff.data[i + 2] = 0; diff.data[i + 3] = 255; } else { diff.data[i] = db.data[i]; diff.data[i + 1] = db.data[i + 1]; diff.data[i + 2] = db.data[i + 2]; diff.data[i + 3] = 70; }
    }
    const cd = Object.assign(document.createElement("canvas"), { width: ib.width, height: ib.height }); cd.getContext("2d").putImageData(diff, 0, 0);
    return { pct: n / (ia.width * ia.height) * 100, n, minY, maxY, diffPng: cd.toDataURL("image/png").split(",")[1] };
  }, [a.toString("base64"), b.toString("base64")]);
  const tag = `${path.replace(/[^\w]+/g, "_") || "root"}-${width}`;
  if (r.sizeDiffer) { bad++; console.log(`FAIL ${path.padEnd(34)} @${width}: page size differs ${r.sizeDiffer.join(" -> ")}`); writeFileSync(`${out}/${tag}-before.png`, a); writeFileSync(`${out}/${tag}-after.png`, b); continue; }
  const over = r.pct > threshold; if (over) bad++;
  console.log(`${over ? "FAIL" : "ok  "} ${path.padEnd(34)} @${width}: ${r.pct.toFixed(4)}% pixels differ${r.n ? ` (rows ${r.minY}-${r.maxY})` : ""}`);
  if (over) { writeFileSync(`${out}/${tag}-before.png`, a); writeFileSync(`${out}/${tag}-after.png`, b); writeFileSync(`${out}/${tag}-diff.png`, Buffer.from(r.diffPng, "base64")); }
}
await browser.close(); console.log(bad ? `${bad} page(s) over the ${threshold}% threshold` : "no visual differences over the threshold"); process.exit(bad ? 1 : 0);
