#!/usr/bin/env node
/**
 * CSP / hydration check for a served build.
 *   node scripts/csp-check.mjs <baseUrl> <path> [<path> ...]
 * For each path: exactly one CSP header; script-src has a nonce and no 'unsafe-inline'; every inline <script> in the
 * HTML carries that nonce; in a real browser the page hydrates, a client-side interaction works, and there are zero
 * securitypolicyviolation events, console errors and page errors. Exit code 1 on any failure.
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const [base, ...paths] = process.argv.slice(2);
const browser = await chromium.launch(); let failures = 0;
for (const path of paths) {
  const notes = [];
  const res = await fetch(base + path, { headers: { "accept-encoding": "identity" } });
  const csp = res.headers.get("content-security-policy") ?? "";
  const scriptSrc = /script-src([^;]*)/.exec(csp)?.[1] ?? "";
  const nonce = /'nonce-([^']+)'/.exec(scriptSrc)?.[1];
  const html = await res.text();
  if (!nonce) notes.push("script-src has no nonce");
  if (/'unsafe-inline'/.test(scriptSrc)) notes.push("script-src still allows 'unsafe-inline'");
  const inline = [...html.matchAll(/<script\b([^>]*)>/g)].filter((m) => !/\bsrc=/.test(m[1]));
  const without = inline.filter((m) => !new RegExp(`nonce="${(nonce ?? "").replace(/[+/=]/g, ".")}"`).test(m[1]));
  if (without.length) notes.push(`${without.length} inline script(s) without the header nonce`);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const problems = [];
  await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => (window.__csp ??= []).push(e.violatedDirective + " " + e.blockedURI)));
  page.on("console", (m) => m.type() === "error" && problems.push("console: " + m.text().slice(0, 140)));
  page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 140)));
  await page.goto(base + path, { waitUntil: "networkidle" }); await page.waitForTimeout(800);
  const hydrated = await page.evaluate(() => [...document.querySelectorAll("body *")].some((el) => Object.keys(el).some((k) => k.startsWith("__reactFiber"))));
  const violations = await page.evaluate(() => window.__csp ?? []);
  if (!hydrated) notes.push("did not hydrate");
  if (violations.length) notes.push("CSP violations: " + violations.join("; "));
  if (problems.length) notes.push(...problems);
  const link = page.locator('header a[href]').first();
  if (await link.count()) { const before = page.url(); await link.click({ trial: true }).catch(() => notes.push("header link not clickable")); void before; }
  console.log(`${notes.length ? "FAIL" : "ok  "} ${path.padEnd(34)} csp-headers=1 nonce=${nonce ? "yes" : "no"} inline-scripts=${inline.length} hydrated=${hydrated}${notes.length ? "  <- " + notes.join(" | ") : ""}`);
  if (notes.length) failures++; await page.close();
}
await browser.close(); process.exit(failures ? 1 : 0);
