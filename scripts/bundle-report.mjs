#!/usr/bin/env node
/**
 * Bundle report for public routes (Q-01): what JavaScript does a page really load, and does any of it
 * contain wallet / chain-library code?
 *   node scripts/bundle-report.mjs <baseUrl> <path> [<path> ...]      (needs a served production build)
 * For each path it (1) loads the page in a real browser, scrolls to the bottom so lazy sections load, and records
 * every script response (raw + gzip bytes); (2) scans each loaded script for wallet/chain markers; (3) walks the
 * import graph (static + dynamic) from the loaded scripts using .vercel/output/static to list wallet chunks that
 * are reachable but were not loaded. Exit code 1 if any wallet/chain code was LOADED on a path given as `--no-wallet=<path>`.
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { basename, join } from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");

const args = process.argv.slice(2);
const noWallet = new Set(args.filter((a) => a.startsWith("--no-wallet=")).map((a) => a.slice(12)));
const [base, ...paths] = args.filter((a) => !a.startsWith("--"));
const ASSETS = join(process.cwd(), ".vercel/output/static/assets");

// Distinctive strings that only appear in these libraries' code (minification-safe: string literals / storage keys / RPC names).
const MARKERS = {
  rainbowkit: [/rk-latest-id/, /rainbowkit/i, /rk-recent/],
  wagmi: [/wagmi\.store/, /wagmi/i],
  walletconnect: [/walletconnect/i, /@reown/i],
  viem: [/viem@/, /\bparseEther\b/, /eth_requestAccounts/],
  // genlayer-js library signatures (RPC method names and SDK entry points), NOT chain-name constants like "Studio Dev".
  genlayer: [/genlayer-js/, /gen_call/, /gen_getContractSchema/, /estimateTransactionFeesForWrite/, /waitForTransactionReceipt/, /eth_sendTransaction/],
};
const scan = (text) => Object.entries(MARKERS).filter(([, res]) => res.some((r) => r.test(text))).map(([k]) => k);
const kb = (n) => (n / 1024).toFixed(1);

const reach = (file, seen = new Set()) => {
  if (seen.has(file) || !existsSync(join(ASSETS, file))) return seen;
  seen.add(file);
  const src = readFileSync(join(ASSETS, file), "utf8");
  for (const m of src.matchAll(/["'`](?:\.\/|assets\/|\/assets\/)([\w.@-]+\.js)["'`]/g)) reach(m[1], seen);
  return seen;
};

const browser = await chromium.launch();
let failed = false;
for (const path of paths) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const loaded = new Map();
  const urls = new Set();
  page.on("response", (r) => { const u = new URL(r.url()); if (/\.js$/.test(u.pathname) && r.status() === 200 && u.origin === new URL(base).origin) urls.add(r.url()); });
  await page.goto(base + path, { waitUntil: "networkidle" });
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 500) { await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(160); }
  await page.waitForLoadState("networkidle"); await page.waitForTimeout(600);
  // Bytes come from a plain GET of each recorded URL (response.body() is unreliable for large scripts).
  for (const u of urls) loaded.set(basename(new URL(u).pathname), Buffer.from(await (await fetch(u)).arrayBuffer()));
  const rows = [...loaded.entries()].map(([name, buf]) => ({ name, raw: buf.length, gz: gzipSync(buf).length, hits: scan(buf.toString("utf8")) })).sort((a, b) => b.gz - a.gz);
  const totalRaw = rows.reduce((s, r) => s + r.raw, 0), totalGz = rows.reduce((s, r) => s + r.gz, 0);
  const flagged = rows.filter((r) => r.hits.length);
  console.log(`\n## ${path}  (390px, full scroll)`);
  console.log(`JS loaded: ${rows.length} files, ${kb(totalRaw)} kB raw, ${kb(totalGz)} kB gzip`);
  console.log("| file | raw kB | gzip kB | wallet/chain markers |\n|---|---|---|---|");
  for (const r of rows.slice(0, 12)) console.log(`| ${r.name} | ${kb(r.raw)} | ${kb(r.gz)} | ${r.hits.join(", ") || "none"} |`);
  if (rows.length > 12) console.log(`| … ${rows.length - 12} more files | | | ${rows.slice(12).some((r) => r.hits.length) ? "SEE FLAGGED" : "none"} |`);
  console.log(flagged.length ? `LOADED wallet/chain code: ${flagged.map((r) => `${r.name} [${r.hits.join(",")}]`).join("; ")}` : "LOADED wallet/chain code: none");
  // reachability: everything the loaded scripts can import (static or dynamic)
  const reachable = new Set(); for (const name of loaded.keys()) reach(name, reachable);
  const reachFlag = [...reachable].filter((f) => !loaded.has(f)).map((f) => ({ f, hits: scan(readFileSync(join(ASSETS, f), "utf8")) })).filter((x) => x.hits.length);
  console.log(`Reachable through dynamic imports but NOT loaded here: ${reachFlag.length ? reachFlag.map((x) => `${x.f} [${x.hits.join(",")}]`).join("; ") : "none"}`);
  if (flagged.length && noWallet.has(path)) failed = true;
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
