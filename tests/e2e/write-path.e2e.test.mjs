// Browser E2E for the lifecycle write path (Lock / arm_guard) against mocked
// wallet + GenLayer RPC. No real transaction is ever created.
import { afterEach, after, describe, it } from "node:test";
import {
  connectWallet, LOCK_BUTTON, CHECK_AGAIN, armSends, assert, closeBrowser, mock, newSession, poll, see, seeNot,
  seededGuard, settle, shot, createGuardThroughUi,
} from "./harness.mjs";

let ctx; // current scenario's session, closed (and screenshotted on failure) in afterEach
const scenario = (name, fn) =>
  it(name, async (t) => {
    try {
      await fn(t);
    } catch (err) {
      for (const [i, p] of (ctx?.context.pages() ?? []).entries()) await shot(p, `${name}-tab${i}`);
      throw err;
    }
  });

afterEach(async () => { await ctx?.close().catch(() => undefined); ctx = undefined; });
after(closeBrowser);

const MISMATCH_RECOVERY = /contact support to recover this Guard/;
// lock-step sends only: the seeding create_guard send is excluded
const sendCalls = (w) => w.calls.filter((c) => c.method === "eth_sendTransaction").length - 1;

describe("write path: Lock Guard", () => {
  scenario("1. reserve -> sign -> pending -> confirmed", async () => {
    ctx = await seededGuard({ timeScale: 20 });
    const { page, wallet } = ctx;
    await mock.scenario({ queue: { arm_guard: ["PENDING"] } });
    const release = wallet.hold();
    await LOCK_BUTTON(page).click();
    // reserved, waiting on the wallet: no hash yet, nothing submitted
    await see(page, /Confirm in your wallet/);
    await poll(() => wallet.calls.some((c) => c.method === "eth_sendTransaction"), { what: "wallet send request" });
    assert.equal(armSends(wallet).length, 0);
    release();
    // submitted but undecided: hash visible, Lock button gone
    await poll(() => armSends(wallet).length === 1, { what: "arm tx registered" });
    const [{ hash }] = armSends(wallet);
    await see(page, /Transaction submitted|Confirming on GenLayer/);
    assert.ok((await page.locator("[data-transaction-hash]").innerText()).includes(hash.slice(0, 8)));
    assert.equal(await LOCK_BUTTON(page).count(), 0, "Lock Guard hidden while a tx is unresolved");
    // chain decides
    await mock.setOutcome({ hash, outcome: "OK" });
    await see(page, /Guard locked/, 30_000);
    assert.equal(await LOCK_BUTTON(page).count(), 0);
    assert.equal(armSends(wallet).length, 1, "exactly one lock transaction was sent");
  });

  scenario("2. revert -> reverted banner -> retry -> replace succeeds (new hash recorded)", async () => {
    ctx = await seededGuard();
    const { page, wallet } = ctx;
    await mock.scenario({ queue: { arm_guard: ["REVERT", "OK"] } });
    await LOCK_BUTTON(page).click();
    await see(page, /Transaction reverted/);
    const [{ hash: first }] = armSends(wallet);
    // proven revert is replaceable: the Lock button is offered again
    await LOCK_BUTTON(page).waitFor({ state: "visible" });
    await LOCK_BUTTON(page).click();
    await see(page, /Guard locked/, 30_000);
    const sent = armSends(wallet);
    assert.equal(sent.length, 2, "one replacement transaction");
    const second = sent[1].hash;
    assert.notEqual(second, first);
    // the server reconciled the NEW hash, i.e. it replaced the recorded one
    const txs = (await mock.state()).txs;
    assert.ok(txs.find((t) => t.hash === second).reads > 0, "server read the replacement hash");
    // persisted: survives a reload
    await page.reload();
    await see(page, /Guard locked/i);
    assert.equal(await LOCK_BUTTON(page).count(), 0);
  });

  scenario("3. pending -> poll cap -> Check again re-reads and never re-sends", async () => {
    ctx = await seededGuard({ timeScale: 100 });
    const { page, wallet } = ctx;
    await mock.scenario({ queue: { arm_guard: ["PENDING"] } });
    await LOCK_BUTTON(page).click();
    await CHECK_AGAIN(page).waitFor({ state: "visible", timeout: 60_000 });
    await see(page, /Still waiting for confirmation/);
    // the poll loop gives up on its own (POLL_CAP = 20 attempts) and then goes quiet
    const reads = await settle(async () => (await mock.state()).serverReads, { quietMs: 2_000, timeout: 90_000 });
    assert.ok(reads >= 20, `poll should reach its cap (saw ${reads} server reads)`);
    const sends = sendCalls(wallet);
    assert.equal(sends, 1);
    assert.equal(await LOCK_BUTTON(page).count(), 0);
    await CHECK_AGAIN(page).click();
    await poll(async () => (await mock.state()).serverReads > reads, { what: "a fresh read after Check again" });
    assert.equal(sendCalls(wallet), sends, "no new eth_sendTransaction");
    assert.equal((await mock.state()).sends, 2, "mock registered only create + lock");
    await CHECK_AGAIN(page).waitFor({ state: "visible" });
  });

  scenario("4. retryable:false (HTTP 429 on reads) -> delayed with Check again", async () => {
    ctx = await seededGuard({ timeScale: 20 });
    const { page, wallet } = ctx;
    await mock.scenario({ queue: { arm_guard: ["OK"] }, rateLimit: { sources: ["server"] } });
    await LOCK_BUTTON(page).click();
    await CHECK_AGAIN(page).waitFor({ state: "visible", timeout: 30_000 });
    await see(page, /Still waiting for confirmation/);
    const reads = await settle(async () => (await mock.state()).serverReads, { quietMs: 2_500 });
    assert.ok(reads < 20, `non-retryable result must stop polling early (saw ${reads} server reads)`);
    assert.equal(sendCalls(wallet), 1);
    // provider recovers: Check again finishes the job without a second signature
    await mock.scenario({ rateLimit: null });
    await CHECK_AGAIN(page).click();
    await see(page, /Guard locked/, 30_000);
    assert.equal(sendCalls(wallet), 1);
  });

  scenario("5. mismatch -> blocked with recovery message, no retry button", async () => {
    ctx = await seededGuard();
    const { page, wallet } = ctx;
    await mock.scenario({ queue: { arm_guard: ["MISMATCH"] } });
    await LOCK_BUTTON(page).click();
    await see(page, /could not be verified/i, 30_000);
    assert.equal(await CHECK_AGAIN(page).count(), 0, "mismatch offers no retry");
    // blocked: no write button (recovery copy is asserted in 5b)
    assert.equal(await LOCK_BUTTON(page).count(), 0, "mismatch hides Lock Guard");
    assert.equal(await CHECK_AGAIN(page).count(), 0);
    assert.equal(sendCalls(wallet), 1, "no second transaction requested");
  });

  // todo: the banner only says "The transaction is not the expected arm_guard call."; the
  // recovery copy (MISMATCH_RECOVERY_MESSAGE) is only reachable via a reserve refusal that the
  // hidden button no longer allows. App change: show it on the mismatch banner.
  it("5b. mismatch banner carries the recovery message", async () => {
    ctx = await seededGuard();
    await mock.scenario({ queue: { arm_guard: ["MISMATCH"] } });
    await LOCK_BUTTON(ctx.page).click();
    await see(ctx.page, /could not be verified/i, 30_000);
    await see(ctx.page, MISMATCH_RECOVERY, 5_000);
  });

  scenario("6. UNDETERMINED -> 'Transaction failed on GenLayer' + recovery message", async () => {
    ctx = await seededGuard();
    const { page, wallet } = ctx;
    await mock.scenario({ queue: { arm_guard: ["UNDETERMINED"] } });
    await LOCK_BUTTON(page).click();
    await see(page, /Transaction failed on GenLayer/, 30_000);
    await see(page, /cannot be replaced automatically/);
    assert.equal(await CHECK_AGAIN(page).count(), 0);
    assert.equal(await LOCK_BUTTON(page).count(), 0, "failed hides Lock Guard");
    assert.equal(sendCalls(wallet), 1, "failed (not reverted) is never auto-replaced");
  });

  scenario("7a. second tab (same browser profile) is refused before any signature request", async () => {
    ctx = await seededGuard();
    const { page, wallet, context, guardId } = ctx;
    await mock.scenario({ queue: { arm_guard: ["OK"] } });
    const release = wallet.hold();
    await LOCK_BUTTON(page).click();
    await poll(() => wallet.callsFrom(0, "eth_sendTransaction").length === 2, { what: "tab 1 waiting at the wallet" });

    const tab2 = await context.newPage();
    await tab2.goto(`/app/guards/${guardId}`);
    await connectWallet(tab2); // a new tab does not auto-reconnect the injected wallet
    await LOCK_BUTTON(tab2).waitFor({ state: "visible", timeout: 30_000 });
    const before = wallet.callsFrom(1).length;
    await LOCK_BUTTON(tab2).click();
    // The refusal copy lives inside the collapsed "Technical details" disclosure (the banner
    // headline is the generic "Transaction failed"), so assert it is in the DOM, not visible.
    await tab2.getByText(/already in progress/).first().waitFor({ state: "attached", timeout: 20_000 });
    assert.equal(wallet.callsFrom(1, "personal_sign", "eth_sendTransaction").length - before, 0, "tab 2 reached the wallet");
    release();
    await see(page, /Guard locked/, 30_000);
    assert.equal(armSends(wallet).length, 1);
  });

  scenario("7b. second tab (separate browser profile) is refused before any signature request", async () => {
    ctx = await seededGuard();
    const { page, wallet, guardId } = ctx;
    await mock.scenario({ queue: { arm_guard: ["OK"] } });
    const release = wallet.hold();
    await LOCK_BUTTON(page).click();
    await poll(() => wallet.callsFrom(0, "eth_sendTransaction").length === 2, { what: "tab 1 waiting at the wallet" });

    // Same wallet account, but its own cookies/localStorage (so its own reservation token).
    // Wallet sign-in is the only call tab 2 may make before the server refusal.
    const other = await newSession();
    try {
      const tab2 = await other.context.newPage();
      await tab2.goto(`/app/guards/${guardId}`);
      // sign in as the same owner (allowed: it is a login, not a transaction)
      await connectWallet(tab2);
      await LOCK_BUTTON(tab2).waitFor({ state: "visible", timeout: 30_000 });
      await LOCK_BUTTON(tab2).click();
      // The refusal copy lives inside the collapsed "Technical details" disclosure (the banner
    // headline is the generic "Transaction failed"), so assert it is in the DOM, not visible.
    await tab2.getByText(/already in progress/).first().waitFor({ state: "attached", timeout: 20_000 });
      assert.equal(other.wallet.calls.filter((c) => c.method === "eth_sendTransaction").length, 0);
    } finally {
      release();
      await other.close();
    }
    await see(page, /Guard locked/, 30_000);
  });
});
