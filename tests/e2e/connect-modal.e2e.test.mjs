// B-11: wallet-gated actions open the RainbowKit connect modal when the wallet
// has dropped, instead of only throwing. Mocked wallet + RPC; no real tx.
import { afterEach, after, describe, it } from "node:test";
import { LOCK_BUTTON, assert, closeBrowser, mock, newSession, poll, see, seededGuard, shot } from "./harness.mjs";

let ctx;
const scenario = (name, fn) =>
  it(name, async () => {
    try { await fn(); } catch (err) {
      for (const [i, p] of (ctx?.context.pages() ?? []).entries()) await shot(p, `${name}-tab${i}`);
      throw err;
    }
  });
afterEach(async () => { await ctx?.close().catch(() => undefined); ctx = undefined; });
after(closeBrowser);

const WRITES = ["eth_sendTransaction", "personal_sign", "eth_signTypedData_v4"];
const connectDialog = (page) => page.getByRole("dialog").filter({ hasText: /connect a wallet/i });
const writesSince = (wallet, n) => wallet.calls.slice(n).filter((c) => WRITES.includes(c.method));

/** Seeded Guard, locked through the mocked flow, so "Start a Run" is offered. */
async function lockedGuard() {
  ctx = await seededGuard({ timeScale: 20 });
  await mock.scenario({ queue: { arm_guard: ["OK"] } });
  await LOCK_BUTTON(ctx.page).click();
  await see(ctx.page, /Guard locked/, 30_000);
  return ctx;
}

describe("B-11: connect modal on wallet-gated actions", () => {
  scenario("a. Guard page: Start a Run while disconnected opens the connect modal, no wallet writes", async () => {
    const { page, wallet } = await lockedGuard();
    const start = page.getByRole("button", { name: /^start a run$/i });
    await start.waitFor({ state: "visible", timeout: 30_000 });
    await wallet.disconnect(page);
    await poll(async () => (await page.locator('[data-wallet="account"]').count()) === 0, { what: "wallet UI to show disconnected" });
    const before = wallet.calls.length;
    await start.click();
    await connectDialog(page).waitFor({ state: "visible", timeout: 10_000 });
    await see(page, /Connect a wallet before starting a Run\./);
    assert.deepEqual(writesSince(wallet, before), []);
    assert.deepEqual(ctx.consoleErrors, []);
  });

  scenario("b. Run page: Add evidence and Finish run while disconnected open the connect modal", async () => {
    const { page, wallet } = await lockedGuard();
    await page.getByRole("button", { name: /^start a run$/i }).click();
    await page.waitForURL(/\/app\/runs\//, { timeout: 30_000 });
    await page.locator("#observation").fill("Prospect matched the declared audience");
    await page.getByRole("button", { name: /^add evidence$/i }).click();
    await page.locator('[data-action="finish-run"]').first().waitFor({ state: "visible", timeout: 20_000 });

    await wallet.disconnect(page);
    await poll(async () => (await page.locator('[data-wallet="account"]').count()) === 0, { what: "wallet UI to show disconnected" });
    const before = wallet.calls.length;

    await page.locator("#observation").fill("Second observation");
    await page.getByRole("button", { name: /^add evidence$/i }).click();
    await connectDialog(page).waitFor({ state: "visible", timeout: 10_000 });
    await see(page, /Connect a wallet before recording evidence\./);
    await page.keyboard.press("Escape");
    await connectDialog(page).waitFor({ state: "hidden", timeout: 5_000 });

    await page.locator('[data-action="finish-run"]').first().click();
    await connectDialog(page).waitFor({ state: "visible", timeout: 10_000 });
    await see(page, /Connect a wallet before finishing this Run\./);
    assert.deepEqual(writesSince(wallet, before), []);
    assert.deepEqual(ctx.consoleErrors, []);
  });

  scenario("c. Workspace /app: disconnected offers Connect, which opens the modal", async () => {
    await mock.reset();
    ctx = await newSession();
    const page = await ctx.context.newPage();
    await page.goto("/app");
    await see(page, /Connect a wallet to open your workspace\./);
    await page.getByRole("button", { name: /^connect wallet$/i }).first().click();
    await connectDialog(page).waitFor({ state: "visible", timeout: 10_000 });
    assert.deepEqual(ctx.consoleErrors, []);
  });
});
