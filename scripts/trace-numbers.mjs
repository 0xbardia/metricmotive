#!/usr/bin/env node
/**
 * Number trace: every number rendered on a page must come from the verified D1 chain record.
 *   node --experimental-strip-types scripts/trace-numbers.mjs <baseUrl> <path> [<path> ...]
 * Loads each page in a real browser (390px, scrolled to the bottom so lazy sections render), collects every
 * numeric token in the visible body text (header and footer chrome excluded), and matches it to a field of
 * D1 (src/lib/d1-case.ts, itself verified against the chain by scripts/verify-d1.mjs).
 * Structural numbers (step/section labels such as "01", "Step 3 of 7") are reported separately.
 * Exit code 1 if any number cannot be traced.
 */
import { createRequire } from "node:module";
import { D1 } from "../src/lib/d1-case.ts";
const { chromium } = createRequire(import.meta.url)("playwright");

const NUM = /\d+(?:,\d{3})*(?:\.\d+)?/g;
const sources = new Map(); // prose numbers: token -> first source description
const idSources = new Map(); // digits inside identifiers (addresses, hashes, ids): only valid for identifier-looking text
const add = (token, src) => { if (!sources.has(token)) sources.set(token, src); };
const harvest = (text, src) => { for (const m of String(text).matchAll(NUM)) add(m[0], src); };
const harvestId = (text, src) => { for (const m of String(text).matchAll(NUM)) if (!idSources.has(m[0])) idSources.set(m[0], src); };
const identifierLike = (text) => /0x|…|\.\.\.|[0-9a-f]{6,}/i.test(text);

for (const [k, v] of Object.entries(D1.counts)) add(String(v), `D1.counts.${k} (recorded evidence event)`);
add(String(D1.metricTarget), "D1.metricTarget (parsed from the on-chain metric text)");
add(String(D1.chainId), "D1.chainId");
add(String(D1.guardId), "D1.guardId (on-chain Guard id)");
harvest(D1.motive, "on-chain motive text");
harvest(D1.metric, "on-chain metric text");
D1.guardrails.forEach((g, i) => harvest(g.text, `on-chain guardrail ${i + 1} text`));
D1.events.forEach((e, i) => { harvest(e.data.observation, `evidence event ${i + 1} observation`); harvest(e.data.result, `evidence event ${i + 1} result`); add(String(e.data.quantity), `evidence event ${i + 1} quantity`); });
for (const [k, v] of Object.entries({ contract: D1.contract, receiptId: D1.receiptId, runId: D1.runId, definitionHash: D1.hashes.definition, evidenceHash: D1.hashes.evidence, manifestHash: D1.hashes.manifest })) harvestId(v, `D1.${k} (identifier, may be shortened with …)`);
for (const [k, iso] of Object.entries(D1.at)) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }).formatToParts(d);
  for (const p of parts) if (/^(year|day|hour|minute|second)$/.test(p.type)) add(String(Number(p.value)), `D1.at.${k} (${iso}), ${p.type}`), add(p.value, `D1.at.${k} (${iso}), ${p.type}`);
}

const [base, ...paths] = process.argv.slice(2);
const browser = await chromium.launch();
let untraced = 0;
for (const path of paths) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(base + path, { waitUntil: "networkidle" });
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 400) { await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(140); }
  await page.waitForLoadState("networkidle"); await page.waitForTimeout(500);
  const collect = () => page.evaluate(() => {
    const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = n.textContent.trim(); if (!t || !/\d/.test(t)) continue;
      const el = n.parentElement; if (!el || el.closest(".site-header, footer, script, style, noscript, .sr-only")) continue;
      const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") continue;
      out.push({ text: t, whole: (el.textContent || "").trim() });
    }
    return out;
  });
  let nodes = await collect();
  // The demo shows one step at a time: walk every step with the Next button and trace each one.
  if (path.startsWith("/demo")) {
    for (let i = 0; i < 12; i++) {
      const next = page.getByRole("button", { name: /^next/i });
      if (!(await next.count()) || (await next.first().isDisabled())) break;
      await next.first().click(); await page.waitForTimeout(250); nodes = nodes.concat(await collect());
    }
  }
  const traced = new Map(), structural = new Map(), bad = [];
  for (const n of nodes) {
    if (/^0?\d{1,2}$/.test(n.text) && /^0\d$/.test(n.text)) { structural.set(n.text, (structural.get(n.text) || 0) + 1); continue; } // "01" labels
    if (/^Step \d+ of \d+$/.test(n.whole) || /^Step \d+ of \d+$/.test(n.text)) { structural.set(n.text, (structural.get(n.text) || 0) + 1); continue; }
    for (const m of n.text.matchAll(NUM)) {
      const src = sources.get(m[0]) || (identifierLike(n.text) ? idSources.get(m[0]) : undefined);
      if (src) { const e = traced.get(m[0]) || { n: 0, src }; e.n++; traced.set(m[0], e); }
      else bad.push({ token: m[0], text: n.text.slice(0, 90) });
    }
  }
  console.log(`\n## ${path}  (${nodes.length} text nodes with digits)`);
  console.log("| number | occurrences | traces to |\n|---|---|---|");
  for (const [tok, e] of [...traced.entries()].sort((a, b) => Number(a[0].replace(/\D/g, "")) - Number(b[0].replace(/\D/g, "")) || a[0].localeCompare(b[0]))) console.log(`| ${tok} | ${e.n} | ${e.src} |`);
  console.log(`Structural labels (not data): ${[...structural.entries()].map(([k, v]) => `${k}×${v}`).join(", ") || "none"}`);
  console.log(bad.length ? `UNTRACED: ${bad.map((b) => `${b.token} in "${b.text}"`).join(" | ")}` : "UNTRACED: none");
  untraced += bad.length; await page.close();
}
await browser.close();
process.exit(untraced ? 1 : 0);
