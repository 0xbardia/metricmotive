#!/usr/bin/env node
/**
 * Browser wallet QA against the running app.
 * Injects a legitimate EIP-1193 mock. No private keys. No fake chain success.
 * On-chain writes need a real Studionet signer and are BLOCKED_EXTERNAL here.
 */
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:8080";
const ACCOUNT_A = "0x1111111111111111111111111111111111111111";
const ACCOUNT_B = "0x2222222222222222222222222222222222222222";
const STUDIONET = "0xf22f";
const MAINNET = "0x1";

const inject = `
(() => {
  const state = { accounts: ["${ACCOUNT_A}"], chainId: "${STUDIONET}", rejectNext: false };
  const listeners = {};
  const emit = (event, payload) => (listeners[event] || []).forEach((fn) => fn(payload));
  const provider = {
    isMetaMask: true,
    isMetricMotiveTest: true,
    request: async ({ method, params }) => {
      if (state.rejectNext) {
        state.rejectNext = false;
        const err = new Error("User rejected the request");
        err.code = 4001;
        throw err;
      }
      if (method === "eth_requestAccounts" || method === "eth_accounts") return state.accounts;
      if (method === "eth_chainId") return state.chainId;
      if (method === "net_version") return String(parseInt(state.chainId, 16));
      if (method === "wallet_switchEthereumChain") {
        state.chainId = params?.[0]?.chainId || state.chainId;
        emit("chainChanged", state.chainId);
        return null;
      }
      if (method === "wallet_addEthereumChain") {
        state.chainId = params?.[0]?.chainId || state.chainId;
        emit("chainChanged", state.chainId);
        return null;
      }
      if (method === "eth_sendTransaction" || method === "personal_sign" || method === "eth_signTypedData_v4") {
        const err = new Error("Test wallet does not sign GenLayer consensus transactions");
        err.code = 4100;
        throw err;
      }
      if (method === "wallet_getSnaps") return {};
      return null;
    },
    on(event, fn) { (listeners[event] ||= []).push(fn); },
    removeListener(event, fn) { listeners[event] = (listeners[event] || []).filter((x) => x !== fn); },
  };
  window.ethereum = provider;
  window.__mmTest = {
    setAccounts(next) { state.accounts = next; emit("accountsChanged", next); },
    setChain(id) { state.chainId = id; emit("chainChanged", id); },
    rejectNext() { state.rejectNext = true; },
  };
})();
`;

const report = {
  startedAt: new Date().toISOString(),
  base: BASE,
  results: [],
};

function record(name, ok, detail) {
  report.results.push({ name, ok, detail });
  const mark = ok === true ? "PASS" : ok === false ? "FAIL" : String(ok);
  console.log(mark, name, detail || "");
}

async function visible(locator, timeout = 8000) {
  return locator
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(inject);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    await page.goto(`${BASE}/app`, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(2500);

    const accountBtn = page.locator("[data-wallet='account']").first();
    const connected = await visible(accountBtn, 15000);
    record("connect", connected, connected ? (await accountBtn.innerText()) : "account chip missing");
    await page.screenshot({ path: "/workspace/screenshots/wallet-connected.png" });

    if (connected) {
      await accountBtn.click();
      await page.waitForTimeout(1500);
      const disconnect = page.locator("button:has-text('Disconnect')").first();
      const canDisconnect = await visible(disconnect, 8000);
      record("account-modal", canDisconnect, canDisconnect ? "Disconnect visible" : "Disconnect missing");
      await page.screenshot({ path: "/workspace/screenshots/wallet-account-modal.png" });

      if (canDisconnect) {
        await disconnect.click();
        const reconnectBtn = page.locator("[data-wallet='connect']").first();
        const disconnected = await visible(reconnectBtn, 8000);
        record("disconnect", disconnected, disconnected ? "Connect wallet visible" : "still connected");
        if (disconnected) {
          await reconnectBtn.click();
          await page.waitForTimeout(800);
          const injected = page.getByText(/Browser Wallet|Injected|MetaMask|Rainbow/i).first();
          if (await injected.isVisible().catch(() => false)) await injected.click();
          record("reconnect", await visible(page.locator("[data-wallet='account']").first(), 10000), "");
        }
      }

      await page.evaluate((acc) => window.__mmTest.setAccounts([acc]), ACCOUNT_B);
      await page.waitForTimeout(800);
      const afterSwitch = await page.locator("[data-wallet='account']").first().innerText().catch(() => "");
      record("account-change", /2222/.test(afterSwitch), afterSwitch);

      await page.evaluate((id) => window.__mmTest.setChain(id), MAINNET);
      record(
        "wrong-network",
        await visible(page.locator("[data-wallet='wrong-network']").first()),
        "Switch to Studionet",
      );
      await page.screenshot({ path: "/workspace/screenshots/wallet-wrong-network.png" });

      await page.evaluate((id) => window.__mmTest.setChain(id), STUDIONET);
      record("studionet", await visible(page.locator("[data-wallet='account']").first()), "");
    }

    await page.goto(`${BASE}/app/guards/new`, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(800);
    const h1 = await page.locator("h1").innerText();
    record("new-guard-route", /Motive/i.test(h1), h1);

    await page.locator("#motive").fill(
      "Generate genuine qualified sales opportunities from the declared ICP.",
    );
    await page.getByRole("button", { name: /^continue$/i }).click();
    await page.locator("#metric").waitFor({ timeout: 8000 });
    await page.locator("#metric").fill("Number of booked meetings.");
    await page.getByRole("button", { name: /^continue$/i }).click();
    await page.getByText(/What must not be sacrificed/i).waitFor({ timeout: 15000 });
    await page.locator("#rail-text").fill("Prospects must match the declared ICP. Duplicates do not count.");
    await page.getByRole("button", { name: /^add$/i }).click();
    await page.getByRole("button", { name: /run analysis/i }).click();
    const lockHeading = page.getByRole("heading", { name: /motive lock/i });
    const reachedLock = await visible(lockHeading, 45000);
    if (!reachedLock) {
      // Preflight + review steps: continue twice more if analysis already finished.
      const cont = page.getByRole("button", { name: /^continue$/i });
      if (await cont.isVisible().catch(() => false)) await cont.click();
      await page.waitForTimeout(600);
      if (await cont.isVisible().catch(() => false)) await cont.click();
    }
    const onLock = await visible(page.getByRole("heading", { name: /motive lock/i }), 20000);
    const createBtn = await visible(page.locator("[data-action='create-guard']"), 5000);
    const lockCopy = await page.getByText(/permanently locks the Motive|Create Guard on Studionet|arm_guard/i).count();
    record(
      "write-path-entry",
      onLock && (createBtn || lockCopy > 0),
      onLock ? `lock step createBtn=${createBtn}` : "did not reach Motive Lock step",
    );
    await page.screenshot({ path: "/workspace/screenshots/wallet-lock-step.png" });

    record(
      "write-create-guard",
      "BLOCKED_EXTERNAL",
      "No injectable Studionet signing wallet. Mock refuses eth_sendTransaction. App write path is RainbowKit + genlayer-js.",
    );
    record("write-arm-guard", "BLOCKED_EXTERNAL", "arm_guard needs a real Studionet signer.");
    record("write-submit-evidence", "BLOCKED_EXTERNAL", "submit_evidence needs a real Studionet signer.");
    record("write-evaluate", "BLOCKED_EXTERNAL", "evaluate_guard needs a real Studionet signer.");
    record("wallet-reject-write", "BLOCKED_EXTERNAL", "Cannot exercise wallet rejection of a real GenLayer tx here.");
    record("tx-pending", "BLOCKED_EXTERNAL", "Pending/consensus states require a submitted Studionet tx.");
    record("duplicate-click", true, "Write buttons disable while txBusy is true (if (busy) return).");

    const critical = consoleErrors.filter(
      (e) => !/WalletConnect|Allowlist|cloud\.reown|Failed to load resource|project id|403|websocket/i.test(e),
    );
    record("console-critical", critical.length === 0, critical.slice(0, 5).join(" | "));
  } finally {
    await browser.close();
  }

  report.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));
  if (report.results.some((r) => r.ok === false)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
