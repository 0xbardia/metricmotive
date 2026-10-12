// Shared helpers for the write-path E2E scenarios.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { installWallet } from "./wallet-init.mjs";

export const APP_DIR = process.env.E2E_APP_DIR || "/root/mm-v2-e2e";
export const BASE_URL = (process.env.E2E_BASE_URL || "http://127.0.0.1:4291").replace(/\/$/, "");
export const MOCK_URL = process.env.E2E_MOCK_URL || "http://127.0.0.1:4292";
export const RPC_URL = "https://studio-dev.genlayer.com/api";
export const SHOT_DIR = process.env.E2E_SHOT_DIR || "/root/MetricMotive-v2-recon/qa/e2e";

const require = createRequire(join(APP_DIR, "package.json"));
const pw = await import(pathToFileURL(require.resolve("playwright")).href);
const chromium = pw.chromium ?? pw.default.chromium;

export const mock = {
  async post(path, body = {}) {
    const r = await fetch(`${MOCK_URL}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return r.json();
  },
  reset: () => mock.post("/__control/reset"),
  scenario: (s) => mock.post("/__control/scenario", s),
  setOutcome: (o) => mock.post("/__control/set-outcome", o),
  state: (tail = 0) => fetch(`${MOCK_URL}/__control/state?tail=${tail}`).then((r) => r.json()),
};

let browser;
export async function launch() {
  browser ??= await chromium.launch({ headless: true });
  return browser;
}
export async function closeBrowser() { await browser?.close(); browser = undefined; }

/** A fresh browser context (own cookies/localStorage) with the mock wallet installed. */
export async function newSession({ timeScale = 1 } = {}) {
  const b = await launch();
  const context = await b.newContext({ baseURL: BASE_URL, viewport: { width: 1280, height: 900 } });
  // External hosts (fonts, WalletConnect, analytics) are irrelevant and must never be reached.
  await context.route((u) => !["127.0.0.1", "localhost"].includes(u.hostname) && u.hostname !== "studio-dev.genlayer.com" && u.protocol.startsWith("http"), (r) => r.abort());
  const wallet = await installWallet(context, { appDir: APP_DIR, mockUrl: MOCK_URL, rpcUrl: RPC_URL, timeScale });
  const consoleErrors = [];
  context.on("page", (p) => {
    p.on("pageerror", (e) => consoleErrors.push(String(e)));
  });
  return { context, wallet, consoleErrors, close: () => context.close() };
}

export async function shot(page, name) {
  mkdirSync(SHOT_DIR, { recursive: true });
  const path = join(SHOT_DIR, `${name.replace(/[^\w.-]+/g, "_")}.png`);
  await page.screenshot({ path, fullPage: true }).catch(() => undefined);
  return path;
}

/** Connect through RainbowKit's modal. */
export async function connectWallet(page) {
  const connected = page.locator('[data-wallet="account"]');
  if (await connected.count()) return;
  await page.getByRole("button", { name: /^connect wallet$/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText(/browser wallet|e2e test wallet/i).first().click();
  await connected.first().waitFor({ timeout: 15_000 });
}

/**
 * Drive the real builder UI to a published (created, DRAFT) Guard and return
 * its app id. Needs the mock's create_guard outcome to be OK.
 */
export async function createGuardThroughUi(page) {
  await page.goto("/app/guards/new");
  await connectWallet(page);
  await page.locator("#motive").fill("Generate genuine qualified sales opportunities from the declared ICP.");
  await page.locator("#metric").fill("Book 80 meetings this week.");
  await page.getByRole("button", { name: /save definition/i }).click();
  await page.getByRole("heading", { name: /what must not be sacrificed/i }).waitFor();
  await page.getByRole("button", { name: /^\+ No duplicate records/ }).click();
  await page.getByLabel("Edit guardrail 1").press("Enter").catch(() => undefined);
  await page.getByRole("button", { name: /review guard/i }).click();
  await page.getByRole("button", { name: /continue to publish/i }).click();
  await page.getByRole("button", { name: /publish definition/i }).click();
  await page.waitForURL(/\/app\/guards\/grd_/, { timeout: 30_000 });
  return page.url().match(/\/app\/guards\/(grd_[^/?#]+)/)[1];
}

// ---------------------------------------------------------------- scenario kit
import assert from "node:assert/strict";

export const LOCK_BUTTON = (page) => page.getByRole("button", { name: /^lock guard$/i });
export const CHECK_AGAIN = (page) => page.getByRole("button", { name: /^check again$/i });

/** Wait until text (string = substring, RegExp) is visible somewhere on the page. */
export async function see(page, text, timeout = 20_000) {
  await page.getByText(text).first().waitFor({ state: "visible", timeout });
}
export async function seeNot(page, text, timeout = 3_000) {
  await page.getByText(text).first().waitFor({ state: "hidden", timeout });
}
export async function poll(fn, { timeout = 20_000, every = 150, what = "condition" } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, every));
  }
  throw new Error(`Timed out waiting for ${what}`);
}
/** Wait for a counter to stop changing for `quietMs`. */
export async function settle(read, { quietMs = 1_500, timeout = 30_000 } = {}) {
  let last = await read();
  let since = Date.now();
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 200));
    const now = await read();
    if (now !== last) { last = now; since = Date.now(); }
    else if (Date.now() - since >= quietMs) return now;
  }
  throw new Error("counter never settled");
}

/** Fresh mock + session + a created (DRAFT, on-chain id set) Guard, ready to Lock. */
export async function seededGuard({ timeScale = 1 } = {}) {
  await mock.reset();
  const session = await newSession({ timeScale });
  const page = await session.context.newPage();
  const guardId = await createGuardThroughUi(page);
  await LOCK_BUTTON(page).waitFor({ state: "visible", timeout: 30_000 });
  const sendsAfterCreate = (await mock.state()).sends;
  return { ...session, page, guardId, sendsAfterCreate };
}

export const armSends = (wallet) => wallet.sent.filter((s) => s.method === "arm_guard");
export { assert };
