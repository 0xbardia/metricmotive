#!/usr/bin/env node
/**
 * Final certification Chromium pass: routes, overflow, console, example labeling.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.CERT_BASE_URL || "http://127.0.0.1:8080";
const OUT = "/workspace/screenshots/cert";
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { path: "/", name: "landing" },
  { path: "/app", name: "app" },
  { path: "/app/guards/new", name: "new-guard" },
  { path: "/contract", name: "contract" },
  { path: "/docs", name: "docs" },
  { path: "/roadmap", name: "roadmap" },
  { path: "/verify/rct_example_sales", name: "example-receipt" },
  { path: "/verify/missing-receipt", name: "missing-receipt" },
];

const VIEWPORTS = [
  { name: "w320", width: 320, height: 720 },
  { name: "w360", width: 360, height: 740 },
  { name: "w390", width: 390, height: 844 },
  { name: "w430", width: 430, height: 932 },
  { name: "w768", width: 768, height: 1024 },
  { name: "w820", width: 820, height: 1180 },
  { name: "w1024", width: 1024, height: 768 },
  { name: "w1280", width: 1280, height: 800 },
  { name: "w1440", width: 1440, height: 900 },
  { name: "w1920", width: 1920, height: 1080 },
];

const CRITICAL = [
  { path: "/", name: "landing", width: 1280, height: 800 },
  { path: "/", name: "landing-mobile", width: 390, height: 844 },
  { path: "/app/guards/new", name: "create-guard", width: 1280, height: 800 },
  { path: "/contract", name: "contract", width: 1280, height: 800 },
  { path: "/docs", name: "docs", width: 1280, height: 800 },
  { path: "/roadmap", name: "roadmap", width: 1280, height: 800 },
  { path: "/verify/rct_example_sales", name: "receipt-example", width: 1280, height: 800 },
];

function isIgnored(text) {
  return /favicon|Download the React DevTools|manifest|WalletConnect|Allowlist|cloud\.reown|project id|403|websocket/i.test(
    text,
  );
}

const browser = await chromium.launch({ headless: true });
const report = {
  startedAt: new Date().toISOString(),
  base: BASE,
  overflow: [],
  consoleErrors: [],
  failedNav: [],
  receipt: {},
};

try {
  for (const route of ROUTES) {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const errors = [];
      page.on("pageerror", (err) => errors.push(String(err)));
      page.on("console", (msg) => {
        if (msg.type() === "error" && !isIgnored(msg.text())) errors.push(msg.text());
      });
      const url = `${BASE}${route.path}`;
      try {
        const res = await page.goto(url, { waitUntil: "load", timeout: 45_000 });
        if (!res || res.status() >= 500) {
          report.failedNav.push({ url, status: res?.status() ?? 0, viewport: vp.name });
        }
        await page.waitForTimeout(400);
        if (route.path === "/verify/rct_example_sales") {
          await page
            .locator("main")
            .getByText(/example|receipt not found/i)
            .first()
            .waitFor({ timeout: 15000 })
            .catch(() => {});
        }
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          return {
            scrollWidth: doc.scrollWidth,
            clientWidth: doc.clientWidth,
            overflowBy: doc.scrollWidth - doc.clientWidth,
          };
        });
        if (overflow.overflowBy > 1) {
          report.overflow.push({ url, viewport: vp.name, ...overflow });
        }
        for (const err of errors) {
          report.consoleErrors.push({ url, viewport: vp.name, err });
        }
        if (route.path === "/verify/rct_example_sales" && vp.width === 1280) {
          const body = await page.locator("main").innerText();
          report.receipt = {
            hasExample: /example/i.test(body),
            hasGenLayerBadge: /GenLayer/.test(body) && !/not a Studionet/i.test(body),
            mentionsLiveAddress: /0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d/i.test(body),
            bodySample: body.slice(0, 800),
          };
        }
      } catch (err) {
        report.failedNav.push({
          url,
          viewport: vp.name,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        await page.close();
      }
    }
  }

  for (const shot of CRITICAL) {
    const page = await browser.newPage({
      viewport: { width: shot.width, height: shot.height },
    });
    await page.goto(`${BASE}${shot.path}`, { waitUntil: "load", timeout: 45_000 });
    if (shot.path === "/verify/rct_example_sales") {
      await page
        .locator("main")
        .getByText(/example|receipt not found/i)
        .first()
        .waitFor({ timeout: 15000 })
        .catch(() => {});
    } else {
      await page.waitForTimeout(500);
    }
    await page.screenshot({
      path: `${OUT}/${shot.name}.png`,
      fullPage: true,
    });
    await page.close();
  }

  const zoomPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await zoomPage.goto(`${BASE}/`, { waitUntil: "load", timeout: 45_000 });
  await zoomPage.evaluate(() => {
    document.body.style.zoom = "1.25";
  });
  await zoomPage.waitForTimeout(200);
  const zoomOverflow = await zoomPage.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  report.zoom125OverflowBy = zoomOverflow;
  await zoomPage.screenshot({ path: `${OUT}/landing-zoom125.png`, fullPage: true });
  await zoomPage.close();
} finally {
  await browser.close();
}

report.finishedAt = new Date().toISOString();
report.ok =
  report.overflow.length === 0 &&
  report.consoleErrors.length === 0 &&
  report.failedNav.length === 0 &&
  report.receipt.hasExample === true &&
  report.receipt.hasGenLayerBadge !== true &&
  report.receipt.mentionsLiveAddress !== true;

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
