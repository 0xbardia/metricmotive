#!/usr/bin/env node
/**
 * WCAG AA contrast audit of rendered pages, in a real browser.
 *   node scripts/contrast-audit.mjs <baseUrl> <path> [<path> ...] [--widths=390,1440] [--walk-demo] [--json=out.json]
 * Every visible text node is composited over its real background chain (buttons, labels, badges, mono/small text,
 * placeholders, disabled controls and control borders are classified separately from body text). Rows the audit
 * cannot judge (text on translucent glass or gradients) are PIXEL-VERIFIED: the text is hidden, the backdrop under
 * the element is screenshotted, and the worst-case pixel decides. Disabled controls are exempt (WCAG 1.4.3) and
 * listed separately. Exit code 1 if any real failure remains.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { auditInPage } from "./lib/contrast-audit-core.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");

const args = process.argv.slice(2);
const opt = (name, d) => (args.find((a) => a.startsWith(`--${name}=`)) ?? "").split("=")[1] ?? d;
const widths = opt("widths", "390,1440").split(",").map(Number);
const jsonOut = opt("json", "");
const walkDemo = args.includes("--walk-demo");
const [base, ...paths] = args.filter((a) => !a.startsWith("--"));

const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

async function pixelVerify(page, row) {
  const el = page.locator(`[data-audit="${row.auditId}"]`).first();
  if (!(await el.count())) return null;
  await el.scrollIntoViewIfNeeded().catch(() => undefined);
  const hide = await page.addStyleTag({ content: "*{color:transparent !important;text-shadow:none !important;-webkit-text-fill-color:transparent !important} svg,img{visibility:hidden !important}" });
  await page.waitForTimeout(250);
  const box = await el.boundingBox();
  if (!box || box.width < 2 || box.height < 2) { await hide.evaluate((e) => e.remove()); return null; }
  const buf = await page.screenshot({ clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.width, height: box.height } });
  await hide.evaluate((e) => e.remove()); // never leave the page with hidden text
  const px = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data; const L = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    let lo = null, hi = null, ll = 9, hl = -1;
    for (let i = 0; i < d.length; i += 4) { const l = L(d[i], d[i + 1], d[i + 2]); if (l < ll) { ll = l; lo = [d[i], d[i + 1], d[i + 2]]; } if (l > hl) { hl = l; hi = [d[i], d[i + 1], d[i + 2]]; } }
    return { lo, hi };
  }, buf.toString("base64"));
  const fg = row.rawFg.slice(0, 3);
  return Math.min(ratio(fg, px.lo), ratio(fg, px.hi));
}

const browser = await chromium.launch();
const all = [];
for (const width of widths) for (const path of paths) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(base + path, { waitUntil: "networkidle" }); await page.evaluate(() => document.fonts.ready);
  const H = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < H; y += 600) { await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(100); }
  await page.waitForLoadState("networkidle"); await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(500);
  const verifyRows = async (rows) => {
    const done = [];
    for (const r of rows) {
      if (r.pass || r.kind === "disabled") { done.push({ ...r, verdict: r.pass ? "pass" : "exempt-disabled" }); continue; }
      if (r.imageBg || r.ratio <= 1.05) { // backdrop unseen by the audit: judge from the rendered pixels
        const worst = await pixelVerify(page, r).catch(() => null);
        if (worst != null) { done.push({ ...r, verdict: worst >= r.need ? "pass-by-pixels" : "FAIL", pixelRatio: +worst.toFixed(2) }); continue; }
      }
      done.push({ ...r, verdict: "FAIL" });
    }
    return done;
  };
  const checked = await verifyRows(await page.evaluate(`(${auditInPage.toString()})()`));
  if (walkDemo && path.startsWith("/demo")) for (let i = 0; i < 12; i++) {
    const next = page.getByRole("button", { name: /^next/i }); if (!(await next.count()) || (await next.first().isDisabled())) break;
    await next.first().click(); await page.waitForTimeout(700);
    await page.evaluate(() => document.querySelectorAll("style[data-audit-hide]").forEach((e) => e.remove()));
    checked.push(...(await verifyRows(await page.evaluate(`(${auditInPage.toString()})()`))));
  }
  all.push({ page: path, width, rows: checked }); await page.close();
}
await browser.close();

const uniq = new Map();
for (const o of all) for (const r of o.rows) { const k = [r.kind, r.fg, r.bg, Math.round(r.size), r.verdict].join("|"); if (!uniq.has(k)) uniq.set(k, { ...r, where: new Set() }); uniq.get(k).where.add(`${o.page}@${o.width}`); }
const list = [...uniq.values()];
const count = (v) => list.filter((r) => r.verdict === v).length;
console.log(`pages x widths: ${all.length}; unique (kind, colours, size) pairs: ${list.length}`);
console.log(`  pass: ${count("pass")}  pass-by-pixels: ${count("pass-by-pixels")}  exempt-disabled: ${count("exempt-disabled")}  FAIL: ${count("FAIL")}`);
for (const r of list.filter((x) => x.verdict === "pass-by-pixels")) console.log(`  glass/gradient row verified by pixels: ${r.kind} ${JSON.stringify(r.text)} ${r.pixelRatio}:1 (need ${r.need}) [${[...r.where].slice(0, 2).join(", ")}]`);
for (const r of list.filter((x) => x.verdict === "exempt-disabled")) console.log(`  exempt (disabled): ${JSON.stringify(r.text)} ${r.ratio}:1 [${[...r.where].slice(0, 2).join(", ")}]`);
for (const r of list.filter((x) => x.verdict === "FAIL").sort((a, b) => a.ratio - b.ratio)) console.log(`FAIL ${String(r.ratio).padStart(5)} need ${r.need} ${r.kind.padEnd(11)} ${Math.round(r.size)}px ${r.fg} on ${r.bg} ${JSON.stringify(r.text)} ${r.sel.slice(0, 50)} [${[...r.where].slice(0, 3).join(", ")}]`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all.map((o) => ({ ...o, rows: o.rows.map(({ rawFg, ...r }) => r) }))));
process.exit(count("FAIL") ? 1 : 0);
