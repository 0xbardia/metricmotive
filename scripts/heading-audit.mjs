#!/usr/bin/env node
/**
 * Heading hierarchy audit: at every width, on every path, h1 >= h2 >= h3 (computed font sizes) and exactly one h1.
 *   node scripts/heading-audit.mjs <baseUrl> <path> [<path> ...] [--widths=390,768,1024,1280,1440,1920]
 * Exit code 1 on any violation.
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const args = process.argv.slice(2);
const widths = ((args.find((a) => a.startsWith("--widths=")) ?? "").split("=")[1] ?? "390,768,1024,1280,1440,1920").split(",").map(Number);
const [base, ...paths] = args.filter((a) => !a.startsWith("--"));
const browser = await chromium.launch(); let bad = 0, checked = 0;
for (const width of widths) for (const path of paths) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(base + path, { waitUntil: "networkidle" }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
  const H = await page.evaluate(() => document.body.scrollHeight); for (let y = 0; y < H; y += 700) { await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(80); }
  await page.waitForLoadState("networkidle");
  const r = await page.evaluate(() => {
    const px = (e) => Math.round(parseFloat(getComputedStyle(e).fontSize) * 10) / 10;
    const vis = (e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== "none";
    const h = (n) => [...document.querySelectorAll("h" + n)].filter(vis).map(px);
    const h1 = h(1), h2 = h(2), h3 = h(3);
    return { n1: h1.length, h1: Math.min(...h1, 1e9), h2max: Math.max(0, ...h2), h2min: Math.min(...h2, 1e9), h3max: Math.max(0, ...h3), has2: h2.length, has3: h3.length };
  });
  checked++; const issues = [];
  if (r.n1 !== 1) issues.push(`${r.n1} h1 elements`);
  if (r.n1 && r.has2 && r.h2max > r.h1) issues.push(`h2 (${r.h2max}px) larger than h1 (${r.h1}px)`);
  if (r.has2 && r.has3 && r.h3max > r.h2max) issues.push(`h3 (${r.h3max}px) larger than the largest h2 (${r.h2max}px)`);
  if (issues.length) { bad++; console.log(`${String(width).padStart(5)}px ${path}: ${issues.join("; ")}`); }
  await page.close();
}
await browser.close();
console.log(`heading hierarchy: ${checked} page/width combinations, ${bad} violation(s)`);
process.exit(bad ? 1 : 0);
