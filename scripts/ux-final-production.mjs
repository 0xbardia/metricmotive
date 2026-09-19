#!/usr/bin/env node
/**
 * Final productization QA. This pass is deliberately read-only: it exercises
 * the public product journey and the unauthenticated write gate, but never
 * connects a wallet or submits a Studionet transaction.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.CERT_BASE_URL || "https://metricmotive.xyz";
const OUT = "/workspace/screenshots/ux-final-production";
const VIDEO = `${OUT}/videos`;
mkdirSync(VIDEO, { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  base: BASE,
  checks: [],
  screenshots: [],
  routeChecks: [],
  mutations: [],
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  badResponses: [],
  performance: [],
};

function ignored(text) {
  return /favicon|Download the React DevTools|manifest|WalletConnect|Allowlist|cloud\.reown|project id|websocket/i.test(text);
}

function check(condition, message) {
  if (!condition) throw new Error(message);
  report.checks.push({ message, ok: true });
}

function observe(page, label) {
  page.on("console", (message) => {
    if (message.type() === "error" && !ignored(message.text())) {
      const item = { label, error: message.text() };
      report.consoleErrors.push(item);
    }
  });
  page.on("pageerror", (error) => {
    const item = { label, error: String(error?.message || error) };
    report.pageErrors.push(item);
  });
  page.on("requestfailed", (request) => {
    const item = { label, url: request.url(), error: request.failure()?.errorText || "failed" };
    if (!/favicon|cloud\.reown|walletconnect/i.test(request.url())) report.failedRequests.push(item);
  });
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
      report.mutations.push({ label, method: request.method(), url: request.url() });
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      report.badResponses.push({ label, status: response.status(), url: response.url() });
    }
  });
}

async function loaded(page, path) {
  const response = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(900);
  check((response?.status() || 0) < 500, `${path} returns no server error`);
  return response;
}

async function visible(page, text, label = text) {
  const locator = page.getByText(text, { exact: true }).first();
  await locator.waitFor({ state: "visible", timeout: 12_000 });
  check(await locator.isVisible(), label);
  return locator;
}

async function heading(page, name, label) {
  const locator = page.getByRole("heading", { name });
  await locator.waitFor({ state: "visible", timeout: 12_000 });
  check(await locator.isVisible(), label);
  return locator;
}

async function noOverflow(page, label) {
  const result = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check(result.scrollWidth <= result.clientWidth + 1, `${label} has no horizontal overflow`);
  return result;
}

async function screenshot(page, name, fullPage = false) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage });
  report.screenshots.push(path);
}

async function pathAfterClick(page, locator, expected, label) {
  await locator.click();
  await page.waitForTimeout(900);
  check(new URL(page.url()).pathname === expected, label);
}

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

try {
  const journey = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: VIDEO, size: { width: 1280, height: 800 } },
  });
  observe(journey, "desktop journey");
  await journey.context().tracing.start({ screenshots: true, snapshots: true, sources: true });

  await loaded(journey, "/");
  await heading(journey, /Your agent hit the metric\./, "landing headline");
  await heading(journey, /Your agent hit the metric\./, "landing hero rendered");
  await screenshot(journey, "journey-landing");

  await pathAfterClick(
    journey,
    journey.getByRole("link", { name: /Create a Motive Guard/ }).first(),
    "/app/guards/new",
    "hero CTA opens Guard builder",
  );
  await visible(journey, "Define what success means.", "builder title");
  check((await journey.getByRole("textbox", { name: "Motive", exact: true }).count()) === 1, "builder has one Motive field");
  check((await journey.getByRole("textbox", { name: "Metric", exact: true }).count()) === 1, "builder has one Metric field");
  check((await journey.getByText("Raw JSON", { exact: true }).count()) === 0, "builder does not lead with raw JSON");
  await journey.getByRole("textbox", { name: "Motive", exact: true }).fill("Create useful qualified opportunities for the declared audience.");
  await journey.getByRole("textbox", { name: "Metric", exact: true }).fill("Book 20 meetings this week.");
  await journey.getByRole("button", { name: "Save definition" }).click();
  await visible(journey, "Connect a wallet to save this Guard.", "unauthenticated builder write gate");
  check(report.mutations.filter((item) => /create_guard|chain|transaction/i.test(item.url)).length === 0, "unauthenticated builder sends no chain mutation");
  await screenshot(journey, "journey-builder-gated", true);

  await loaded(journey, "/");
  await pathAfterClick(
    journey,
    journey.getByRole("link", { name: "How it works", exact: true }),
    "/",
    "How it works stays on landing",
  );
  check(new URL(journey.url()).hash === "#how-it-works", "How it works lands on the correct section");
  await visible(journey, "Once locked, the target cannot be rewritten after seeing the result.", "Motive Lock section");

  await loaded(journey, "/");
  await journey.getByRole("link", { name: "View a real receipt", exact: true }).click();
  await journey.waitForTimeout(500);
  check(new URL(journey.url()).hash === "#receipt", "proof CTA lands on receipt section");
  await visible(journey, "Motive Receipt", "landing receipt section");
  await pathAfterClick(
    journey,
    journey.getByRole("link", { name: "View receipt", exact: true }),
    "/verify/rct_example_sales",
    "public receipt link opens verification route",
  );
  await visible(journey, "Certification example", "receipt example label").catch(async () => {
    await visible(journey, "Example", "receipt example label");
  });
  await screenshot(journey, "journey-receipt", true);

  await loaded(journey, "/app");
  await visible(journey, "Connect a wallet to open your workspace.", "empty workspace state");
  await screenshot(journey, "journey-app", true);
  await pathAfterClick(
    journey,
    journey.getByRole("link", { name: "Build a Guard", exact: true }),
    "/app/guards/new",
    "app navigation opens builder",
  );

  await journey.context().tracing.stop({ path: `${OUT}/ux-critical-journey.trace.zip` });
  await journey.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  observe(mobile, "mobile journey");
  await loaded(mobile, "/");
  await heading(mobile, /Your agent hit the metric\./, "mobile landing headline");
  const menu = mobile.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  await mobile.locator("#mobile-nav").waitFor({ state: "visible" });
  check(await mobile.locator("#mobile-nav").isVisible(), "mobile navigation opens");
  await mobile.keyboard.press("Escape");
  await mobile.locator("#mobile-nav").waitFor({ state: "hidden" });
  check(!(await mobile.locator("#mobile-nav").isVisible()), "Escape closes mobile navigation");
  await menu.click();
  await mobile.mouse.click(5, 600);
  await mobile.locator("#mobile-nav").waitFor({ state: "hidden" });
  check(!(await mobile.locator("#mobile-nav").isVisible()), "outside click closes mobile navigation");
  await menu.click();
  await pathAfterClick(
    mobile,
    mobile.locator("#mobile-nav").getByRole("link", { name: "Open App", exact: true }),
    "/app",
    "mobile Open App opens workspace",
  );
  await visible(mobile, "Connect a wallet to open your workspace.", "mobile empty workspace state");
  await noOverflow(mobile, "mobile app");
  await screenshot(mobile, "journey-mobile-app", true);
  await mobile.close();

  const reduced = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  observe(reduced, "reduced motion");
  await loaded(reduced, "/");
  await heading(reduced, /Your agent hit the metric\./, "reduced-motion landing content");
  await noOverflow(reduced, "reduced-motion landing");
  await screenshot(reduced, "journey-reduced-motion");
  await reduced.close();

  const readOnlyRoutes = [
    ["/app/guards/grd_example_sales", "guard example"],
    ["/app/runs/run_example_sales", "run example"],
    ["/contract", "contract page"],
    ["/docs", "docs page"],
    ["/roadmap", "roadmap page"],
    ["/verify/rct_example_sales", "public receipt"],
    ["/verify/missing-receipt", "missing receipt"],
  ];
  for (const [path, label] of readOnlyRoutes) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    observe(page, label);
    const response = await loaded(page, path);
    const expected = path.includes("missing")
      ? "This receipt does not exist."
      : path.includes("grd_example")
        ? "Example"
        : path.includes("run_example")
          ? "This Run does not exist."
          : path === "/contract"
            ? "Contract"
      : path === "/docs"
              ? "Documentation"
              : path === "/roadmap"
                ? "Roadmap"
                : "Example";
    await visible(page, expected, `${label} renders truthful content`);
    await noOverflow(page, label);
    if (path.includes("grd_example")) {
      const technical = page.locator("details").filter({ hasText: "contract proof" }).first();
      check((await technical.count()) === 1, "Guard example has collapsed technical details");
      await technical.locator("summary").click();
      check(await technical.evaluate((element) => (element instanceof HTMLDetailsElement ? element.open : false)), "Guard technical details expand on demand");
      const copy = page.getByRole("button", { name: "Copy contract address", exact: true });
      check((await copy.count()) === 1, "Guard contract has an accessible copy control");
      check(/contract/i.test(await technical.innerText()), "expanded Guard details expose contract proof");
      await copy.click();
    }
    if (path === "/verify/rct_example_sales") {
      const copy = page.getByRole("button", { name: /Copy / }).first();
      check((await copy.count()) === 1, "receipt has an accessible copy control");
      await copy.click();
    }
    report.routeChecks.push({ path, label, status: response?.status() || 0, url: page.url() });
    await screenshot(page, `route-${label.replaceAll(" ", "-")}`, true);
    await page.close();
  }

  const docs = await browser.newPage({ viewport: { width: 390, height: 844 } });
  observe(docs, "docs anchor interaction");
  await loaded(docs, "/docs");
  // The docs section is "SDK & agent integration" (slug #sdk); the Run page's
  // "Connect an agent" link must point at that same anchor.
  // The mobile section nav is a horizontal scroller, so the SDK link starts
  // off-screen; scroll it in before clicking (the real user gesture).
  const sdkLink = docs.getByRole("link", { name: "SDK", exact: true });
  await sdkLink.scrollIntoViewIfNeeded();
  await sdkLink.click();
  await docs.waitForTimeout(250);
  check(new URL(docs.url()).hash === "#sdk", "Docs anchor updates the URL");
  check(await docs.getByRole("heading", { name: "SDK & agent integration", exact: true }).isVisible(), "Docs anchor reveals the requested section");
  await noOverflow(docs, "Docs anchor interaction");
  await docs.close();

  const keyboard = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  observe(keyboard, "keyboard and zoom");
  await loaded(keyboard, "/app/guards/new");
  const motive = keyboard.getByRole("textbox", { name: "Motive", exact: true });
  const metric = keyboard.getByRole("textbox", { name: "Metric", exact: true });
  await motive.focus();
  await keyboard.keyboard.press("Tab");
  check(await metric.evaluate((element) => document.activeElement === element), "Guard builder keyboard order reaches Metric");
  await keyboard.evaluate(() => {
    document.body.style.zoom = "1.25";
  });
  await keyboard.waitForTimeout(200);
  await noOverflow(keyboard, "Guard builder at 125 percent zoom");
  await keyboard.close();

  for (const path of ["/", "/app", "/app/guards/grd_example_sales", "/verify/rct_example_sales"]) {
    for (const viewport of [
      { name: "desktop", width: 1280, height: 800 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      observe(page, `performance ${path} ${viewport.name}`);
      const start = Date.now();
      const response = await loaded(page, path);
      const metrics = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const paint = performance.getEntriesByType("paint");
        const fcp = paint.find((entry) => entry.name === "first-contentful-paint");
        const resourceEntries = performance.getEntriesByType("resource");
        const transfer = resourceEntries.reduce((sum, entry) => sum + (entry.transferSize || 0), 0);
        const js = resourceEntries
          .filter((entry) => entry.name.includes(".js"))
          .reduce((sum, entry) => sum + (entry.transferSize || 0), 0);
        return {
          ttfb: nav?.responseStart || 0,
          fcp: fcp?.startTime || 0,
          dcl: nav?.domContentLoadedEventEnd || 0,
          load: nav?.loadEventEnd || 0,
          transfer,
          js,
          requests: resourceEntries.length,
        };
      });
      await noOverflow(page, `performance ${path} ${viewport.name}`);
      report.performance.push({ path, viewport: viewport.name, status: response?.status() || 0, wallMs: Date.now() - start, ...metrics });
      await page.close();
    }
  }
} finally {
  await browser.close();
}

report.finishedAt = new Date().toISOString();
report.ok =
  report.consoleErrors.length === 0 &&
  report.pageErrors.length === 0 &&
  report.failedRequests.length === 0 &&
  report.badResponses.length === 0 &&
  report.mutations.filter((item) => /create_guard|arm_guard|submit_evidence|evaluate_guard/i.test(item.url)).length === 0;
writeFileSync(`${OUT}/interaction-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
