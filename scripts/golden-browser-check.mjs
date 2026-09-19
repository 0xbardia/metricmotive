#!/usr/bin/env node
/**
 * Read-only Chromium pass over the golden case and the documentation.
 *
 * It never connects a wallet and never signs anything: every route below is
 * public. Screenshots go to /workspace/screenshots/golden so they sit beside the
 * other certification artifacts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.CERT_BASE_URL || "http://127.0.0.1:8080";
const OUT = "/workspace/screenshots/golden";
mkdirSync(OUT, { recursive: true });

const GUARD = "/app/guards/grd_6d6278eb29c57b18";
const RUN = "/app/runs/run_23d38577bc28cf7e";
const RECEIPT = "/verify/rct_bf3bc92aba3e2d26";

const ROUTES = [
  { path: "/", name: "landing", expect: /metric/i },
  { path: "/docs", name: "docs", expect: /Documentation/ },
  { path: "/docs#verdicts", name: "docs-anchor", expect: /Verdict taxonomy/ },
  { path: "/app", name: "app", expect: /Guard|Case|Build/i },
  { path: GUARD, name: "guard", expect: /run_23d3.*28cf7e/ },
  { path: RUN, name: "run", expect: /run_23d3.*28cf7e|What happened/ },
  { path: RECEIPT, name: "receipt", expect: /Evidence that mattered|PARTIAL_ALIGNMENT/ },
  { path: "/contract", name: "contract", expect: /0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d/ },
  { path: "/roadmap", name: "roadmap", expect: /./ },
];

const VIEWPORTS = [
  { name: "w320", width: 320, height: 720 },
  { name: "w390", width: 390, height: 844 },
  { name: "w768", width: 768, height: 1024 },
  { name: "w1280", width: 1280, height: 800 },
  { name: "w1920", width: 1920, height: 1080 },
];

function ignored(text) {
  return /favicon|Download the React DevTools|manifest|WalletConnect|Allowlist|cloud\.reown|project id|403|websocket/i.test(
    text,
  );
}

const browser = await chromium.launch({ headless: true });
const report = {
  startedAt: new Date().toISOString(),
  base: BASE,
  checks: [],
  consoleErrors: [],
  pageErrors: [],
  hydrationErrors: [],
  overflow: [],
  missingText: [],
  failedNav: [],
};

for (const route of ROUTES) {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    page.on("pageerror", (err) => report.pageErrors.push({ route: route.name, vp: vp.name, err: String(err) }));
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (ignored(text)) return;
      report.consoleErrors.push({ route: route.name, vp: vp.name, err: text });
      if (/hydrat/i.test(text)) report.hydrationErrors.push({ route: route.name, vp: vp.name, err: text });
    });

    const url = `${BASE}${route.path}`;
    try {
      const res = await page.goto(url, { waitUntil: "load", timeout: 45_000 });
      if (!res || res.status() >= 500) {
        report.failedNav.push({ url, vp: vp.name, status: res?.status() ?? 0 });
      }
      // These pages fill in from a client query, so wait for the network to
      // settle before judging text; a fixed short delay raced the fetch.
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(600);

      const body = await page.locator("body").innerText();
      if (!route.expect.test(body)) {
        report.missingText.push({ route: route.name, vp: vp.name, expect: String(route.expect) });
      }

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      if (overflow.scrollWidth - overflow.clientWidth > 1) {
        report.overflow.push({
          route: route.name,
          vp: vp.name,
          by: overflow.scrollWidth - overflow.clientWidth,
        });
      }

      if (vp.width >= 1280) {
        await page.screenshot({ path: `${OUT}/${route.name}-${vp.name}.png`, fullPage: false });
      }
    } catch (err) {
      report.failedNav.push({
        url,
        vp: vp.name,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await page.close();
    }
  }
}

await browser.close();

report.ok =
  report.consoleErrors.length === 0 &&
  report.pageErrors.length === 0 &&
  report.hydrationErrors.length === 0 &&
  report.overflow.length === 0 &&
  report.missingText.length === 0 &&
  report.failedNav.length === 0;

writeFileSync(`${OUT}/verdict.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
