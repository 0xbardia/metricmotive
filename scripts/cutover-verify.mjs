#!/usr/bin/env node
// Read-only post-cut-over verification of a LIVE base URL (CUTOVER.md step 5 "Then:"). GET requests only.
//   node scripts/cutover-verify.mjs --base URL [--release-dir DIR] [--expect-chain 61997] [--expect-contract 0x...]
// Prints `PASS|FAIL name — detail` per check and a final `VERDICT: PASS|FAIL`; exit 0 on PASS, 1 on FAIL, 2 on usage.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

export const DEFAULT_CHAIN = 61997;
export const DEFAULT_CONTRACT = "0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703";
export const ROUTES = ["/", "/demo", "/docs", "/contract", "/roadmap", "/verify/rct_14804bf62424284e", "/app", "/app/guards/new"];
const TIMEOUT_MS = 8000;

export function parseArgs(argv) {
  const o = { chain: DEFAULT_CHAIN, contract: DEFAULT_CONTRACT };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === "--base") o.base = v?.replace(/\/+$/, "");
    else if (k === "--release-dir") o.releaseDir = v;
    else if (k === "--expect-chain") o.chain = Number(v);
    else if (k === "--expect-contract") o.contract = v;
    else return { error: `unknown argument ${k}` };
    i++;
  }
  if (!o.base || !/^https?:\/\//.test(o.base)) return { error: "--base URL is required (no default, to avoid surprises)" };
  if (!Number.isInteger(o.chain)) return { error: "--expect-chain must be an integer" };
  return o;
}

/** Local-path href/src values (start with one "/"), query and hash stripped. Covers modulepreload and stylesheet links. */
export function extractAssets(html) {
  const out = new Set();
  for (const m of html.matchAll(/\b(?:href|src)\s*=\s*["'](\/(?!\/)[^"'#?\s]*)/gi)) out.add(m[1]);
  return [...out].sort();
}

/** `/assets/...` strings inside a JS file. */
export function extractAssetStrings(js) {
  const out = new Set();
  for (const m of js.matchAll(/\/assets\/[\w.\-@]+\.[A-Za-z0-9]{2,5}/g)) out.add(m[0]);
  return [...out].sort();
}

/** Problems with a parsed /api/v1/ready body (empty = fine). */
export function validateReady(j, { chain = DEFAULT_CHAIN, contract = DEFAULT_CONTRACT } = {}) {
  if (!j || typeof j !== "object") return ["ready body is not a JSON object"];
  const p = [];
  if (j.status !== "ready") p.push(`status is ${JSON.stringify(j.status)}`);
  if (j.db !== true) p.push(`db is ${JSON.stringify(j.db)}`);
  if (j.chainId !== chain) p.push(`chainId is ${JSON.stringify(j.chainId)}, expected ${chain}`);
  if (String(j.contractAddress ?? "").toLowerCase() !== String(contract).toLowerCase()) p.push("contractAddress differs from expected");
  return p;
}

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

async function get(base, path) {
  try {
    const r = await fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "accept-encoding": "identity" } });
    return { status: r.status, body: Buffer.from(await r.arrayBuffer()) };
  } catch (e) {
    return { status: 0, body: Buffer.alloc(0), error: `${e.cause?.code ?? e.name}: ${e.message}` };
  }
}

/** Every resolvable playwright (own, release dir, E2E app dir); the first whose Chromium is installed is used. */
async function launchChromium(releaseDir) {
  const errs = [];
  const roots = [import.meta.url, releaseDir && join(releaseDir, "package.json"), join(process.env.E2E_APP_DIR || "/root/mm-v2-e2e", "package.json")].filter(Boolean);
  for (const from of roots) {
    try {
      const { chromium } = createRequire(from)("playwright");
      return await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    } catch (e) { errs.push(String(e.message).split("\n")[0]); }
  }
  throw new Error(errs.length ? errs[errs.length - 1] : "playwright not resolvable");
}

export async function run(o, print = console.log) {
  let failed = 0;
  const check = (ok, name, detail) => { if (!ok) failed++; print(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`); };
  const verdict = () => { print(`VERDICT: ${failed ? "FAIL" : "PASS"}`); return failed ? 1 : 0; };

  const first = await get(o.base, "/");
  if (first.status === 0) { check(false, "reachable", `cannot connect to ${o.base} (${first.error}); aborting`); return verdict(); }

  const pages = {};
  for (const r of ROUTES) {
    const g = r === "/" ? first : await get(o.base, r);
    pages[r] = g;
    check(g.status === 200, `route ${r}`, g.error ?? `HTTP ${g.status}`);
  }

  const assets = new Set();
  for (const r of ROUTES) if (pages[r].status === 200) for (const a of extractAssets(pages[r].body.toString("utf8"))) assets.add(a);
  const bodies = new Map();
  const fetchAsset = async (a) => { const g = await get(o.base, a); bodies.set(a, g.body); check(g.status === 200, `asset ${a}`, g.error ?? `HTTP ${g.status}`); };
  for (const a of [...assets].sort()) await fetchAsset(a);
  // /assets/* strings inside the referenced JS entry files
  for (const a of [...assets].filter((x) => /^\/assets\/.*\.js$/.test(x))) {
    for (const s of extractAssetStrings(bodies.get(a).toString("utf8"))) if (!assets.has(s)) { assets.add(s); await fetchAsset(s); }
  }

  const health = await get(o.base, "/api/v1/health");
  check(health.status === 200, "api /api/v1/health", health.error ?? `HTTP ${health.status}`);
  const ready = await get(o.base, "/api/v1/ready");
  let probs;
  try { probs = ready.status === 200 ? validateReady(JSON.parse(ready.body.toString("utf8")), o) : [ready.error ?? `HTTP ${ready.status}`]; } catch { probs = ["ready body is not JSON"]; }
  check(!probs.length, "api /api/v1/ready", probs.length ? probs.join("; ") : `ready, db true, chain ${o.chain}, contract ${o.contract}`);

  if (o.releaseDir) {
    const root = join(o.releaseDir, ".vercel/output/static");
    const live = [...assets].filter((a) => a.startsWith("/assets/"));
    let bad = [];
    for (const a of live) {
      const f = join(root, a);
      if (!existsSync(f)) bad.push(`${a} missing in release`);
      else if (sha(readFileSync(f)) !== sha(bodies.get(a) ?? Buffer.alloc(0))) bad.push(`${a} differs from release`);
    }
    check(!bad.length, "release-dir match", bad.length ? bad.slice(0, 5).join("; ") : `${live.length} live /assets files exist in the release build with identical sha256`);
  }

  let browser;
  try {
    browser = await launchChromium(o.releaseDir);
    const ctx = await browser.newContext({ baseURL: o.base, viewport: { width: 1280, height: 900 } }); // no wallet injected
    const writes = [];
    const origin = new URL(o.base).origin;
    ctx.on("request", (r) => { if (r.method() !== "GET" && r.url().startsWith(origin)) writes.push(`${r.method()} ${new URL(r.url()).pathname}`); });
    for (const path of ["/", "/app"]) {
      const page = await ctx.newPage();
      const consoleErrors = [], pageErrors = [], failedReqs = [];
      page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 160)));
      page.on("pageerror", (e) => pageErrors.push(String(e.message ?? e).slice(0, 160)));
      page.on("requestfailed", (r) => failedReqs.push(`${r.url().slice(0, 100)} (${r.failure()?.errorText})`));
      await page.goto(path, { waitUntil: "load", timeout: 20_000 });
      const hydrated = await page
        .waitForFunction(() => [...document.querySelectorAll("body *")].some((el) => Object.keys(el).some((k) => k.startsWith("__reactFiber"))), null, { timeout: 15_000 })
        .then(() => true, () => false);
      await page.waitForTimeout(1000);
      check(hydrated, `browser ${path} hydrated`, hydrated ? "React fibers attached" : "no React fiber after 15 s");
      check(!consoleErrors.length && !pageErrors.length, `browser ${path} console`, `${consoleErrors.length} console errors, ${pageErrors.length} pageerrors${consoleErrors[0] ? `; first: ${consoleErrors[0]}` : ""}${pageErrors[0] ? `; first: ${pageErrors[0]}` : ""}`);
      check(!failedReqs.length, `browser ${path} requests`, failedReqs.length ? `${failedReqs.length} failed, first: ${failedReqs[0]}` : "0 failed requests");
      if (path === "/app") {
        await page.getByRole("button", { name: /^connect wallet$/i }).first().click({ timeout: 10_000 }).catch(() => undefined);
        const open = await page.getByRole("dialog").filter({ hasText: /connect a wallet/i }).waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false);
        check(open, "browser /app connect modal", open ? "opens with no wallet injected" : "modal did not open");
        check((await page.locator('[data-wallet="account"]').count()) === 0, "browser /app nothing connected", "no connected-account UI");
      }
      await page.close();
    }
    check(!writes.length, "browser no writes", writes.length ? `non-GET requests to base: ${writes.join(", ")}` : "no non-GET request reached the base");
  } catch (e) {
    check(false, "browser", `could not run: ${String(e.message).split("\n")[0]}`);
  } finally {
    await browser?.close().catch(() => undefined);
  }
  return verdict();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const o = parseArgs(process.argv.slice(2));
  if (o.error) { console.error(`${o.error}\nusage: cutover-verify.mjs --base URL [--release-dir DIR] [--expect-chain 61997] [--expect-contract 0x...]`); process.exit(2); }
  process.exit(await run(o));
}
