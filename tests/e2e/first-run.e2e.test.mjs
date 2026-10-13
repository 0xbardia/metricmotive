// First-run visitor path: landing -> demo -> builder -> connect prompt -> connect. Mocked wallet + RPC only.
import { afterEach, after, describe, it } from "node:test";
import { assert, closeBrowser, mock, newSession, shot, BASE_URL } from "./harness.mjs";

let ctx;
const notes = [];
const STRICT = process.env.E2E_STRICT_COPY === "1";
/** Soft assertion: records a note; only fails the run when E2E_STRICT_COPY=1. */
async function soft(name, fn) {
  try { await fn(); } catch (e) {
    notes.push(`SOFT FAIL ${name}: ${String(e.message).split("\n")[0]}`);
    console.log(notes.at(-1));
    if (STRICT) throw e;
  }
}
const scenario = (name, fn) =>
  it(name, async () => {
    try { await fn(); } catch (err) {
      for (const [i, p] of (ctx?.context.pages() ?? []).entries()) await shot(p, `first-run-${name}-tab${i}`);
      throw err;
    }
  });
afterEach(async () => { await ctx?.close().catch(() => undefined); ctx = undefined; });
after(async () => { for (const n of notes) console.log(n); await closeBrowser(); });

// Copied from scripts/bundle-report.mjs (not imported).
const MARKERS = {
  rainbowkit: [/rk-latest-id/, /rainbowkit/i, /rk-recent/],
  wagmi: [/wagmi\.store/, /wagmi/i],
  walletconnect: [/walletconnect/i, /@reown/i],
  viem: [/viem@/, /\bparseEther\b/, /eth_requestAccounts/],
  genlayer: [/genlayer-js/, /gen_call/, /gen_getContractSchema/, /estimateTransactionFeesForWrite/, /waitForTransactionReceipt/, /eth_sendTransaction/],
};
const WALLET_NAME = /rainbow|wagmi|wallet|provider/i;

/** Track same-origin .js responses on a page. */
const trackScripts = (page) => {
  const urls = new Set();
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (/\.js$/.test(u.pathname) && r.status() === 200 && u.origin === new URL(BASE_URL).origin) urls.add(r.url());
  });
  return urls;
};
async function assertNoWalletCode(urls, where) {
  const bad = [];
  for (const u of urls) {
    const name = new URL(u).pathname.split("/").pop();
    if (WALLET_NAME.test(name)) bad.push(`${name} (name)`);
    const text = await (await fetch(u)).text();
    const hits = Object.entries(MARKERS).filter(([, res]) => res.some((r) => r.test(text))).map(([k]) => k);
    if (hits.length) bad.push(`${name} (${hits.join(",")})`);
  }
  assert.deepEqual(bad, [], `${where}: wallet/chain code was loaded`);
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const WRITES = ["personal_sign", "eth_sendTransaction", "eth_signTypedData_v4", "eth_sign"];
const settle = (page) => page.waitForLoadState("networkidle").catch(() => undefined);

describe("first-run visitor path", () => {
  scenario("first-run: landing, demo, builder, connect prompt, connect", async () => {
    await mock.reset();
    ctx = await newSession();
    const { wallet } = ctx;
    const page = await ctx.context.newPage();
    const scripts = trackScripts(page);

    // 1. Landing
    await page.goto("/");
    await page.getByRole("heading", { level: 1, name: /Your agent hit the metric\. Did it honor the motive\?/ }).waitFor();
    const labels = (await page.locator("header nav a").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    const want = ["The problem", "A real case", "How it works", "Who it's for", "Trust", "Docs"];
    assert.deepEqual(want.filter((w) => labels.includes(w)), want, `header nav labels: ${JSON.stringify(labels)}`);
    await settle(page);
    assert.equal(await page.locator("[data-wallet]").count(), 0, "no wallet UI on /");
    await assertNoWalletCode(scripts, "/");

    // 2. Demo
    await page.getByRole("link", { name: /^try the demo$/i }).first().click();
    await page.waitForURL(/\/demo$/);
    const progress = page.getByText(/^Step \d+ of \d+$/i);
    await progress.waitFor();
    const total = Number((await progress.textContent()).match(/of (\d+)/i)[1]);
    assert.equal(total, 7);
    const next = page.getByRole("button", { name: /^next/i });
    const back = page.getByRole("button", { name: /^back/i });
    for (let n = 1; n < total; n++) {
      const before = await progress.textContent();
      await next.click();
      await page.getByText(`Step ${n + 1} of ${total}`, { exact: true }).waitFor(); // exact: the sr-only live region repeats it
      assert.notEqual(await progress.textContent(), before);
      const focusedIsHeading = await page.evaluate(() => /^H[1-6]$/.test(document.activeElement?.tagName ?? ""));
      assert.ok(focusedIsHeading, `focus on step heading after Next (step ${n + 1})`);
      // the polite live region (sr-only) announces "Step n of 7: <title>" on every change
      const live = await page.locator("[aria-live=polite]").filter({ hasText: /Step \d+ of \d+/ }).first().textContent();
      const h = await page.evaluate(() => document.activeElement?.textContent?.trim());
      assert.ok(live.includes(h), "aria-live region contains the new step heading");
    }
    // verdict is step 6 of 7: go back one, check, forward
    await back.click();
    await page.getByText(`Step ${total - 1} of ${total}`, { exact: true }).waitFor();
    await page.getByRole("heading", { name: /verdict/i }).waitFor();
    assert.ok(await page.getByText(/metric gaming/i).first().isVisible(), "verdict badge/label");
    assert.ok(await page.getByText(/hit the metric but failed the motive|failed the motive/i).first().isVisible(), "one-sentence meaning");
    await soft("verdict badge element", async () => assert.ok(await page.locator('[data-verdict], [class*="badge"]').first().isVisible()));
    // keyboard
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => undefined);
    await soft("Right/Left arrow keys step the replay", async () => {
      await page.keyboard.press("ArrowRight");
      await page.getByText(`Step ${total} of ${total}`, { exact: true }).waitFor({ timeout: 2000 });
      await page.keyboard.press("ArrowLeft");
      await page.getByText(`Step ${total - 1} of ${total}`, { exact: true }).waitFor({ timeout: 2000 });
    });
    // skip to end
    await page.getByRole("button", { name: /^back/i }).click().catch(() => undefined);
    await soft("Skip to the end lands on last step", async () => {
      await page.getByRole("button", { name: /skip to the end/i }).click({ timeout: 2000 });
      await page.getByText(`Step ${total} of ${total}`, { exact: true }).waitFor({ timeout: 2000 });
    });
    await settle(page);
    assert.equal(await page.locator("[data-wallet]").count(), 0, "no wallet UI on /demo");
    await assertNoWalletCode(scripts, "/demo");

    // make sure we are on the last step
    while (!(await page.getByText(`Step ${total} of ${total}`, { exact: true }).count())) await next.click();

    // 3. Builder, no wallet
    await page.getByRole("link", { name: /create a motive guard/i }).last().click();
    await page.waitForURL(/\/app\/guards\/new/);
    await page.getByRole("heading", { level: 1, name: /define what success means|define/i }).waitFor();
    await soft("three-step explanation", async () => {
      for (const t of [/save the draft/i, /lock it on-chain/i, /run and verify/i]) await page.getByText(t).first().waitFor({ timeout: 2000 });
    });
    await page.locator("#motive").fill("Generate genuine qualified sales opportunities from the declared ICP.");
    await page.locator("#metric").fill("Book 80 meetings this week.");
    assert.equal(await page.locator("#metric").inputValue(), "Book 80 meetings this week.");

    // 4. Disconnected save -> connect prompt, no wallet writes
    const dialog = page.getByRole("dialog").filter({ hasText: /connect a wallet/i });
    await page.getByRole("button", { name: /save draft|save definition/i }).click();
    await dialog.waitFor({ state: "visible", timeout: 15_000 });
    assert.deepEqual(wallet.calls.filter((c) => WRITES.includes(c.method)), [], "no signature/tx before connecting");
    await dialog.getByText(/browser wallet|e2e test wallet/i).first().click();
    await page.locator('[data-wallet="account"]').first().waitFor({ timeout: 15_000 });
    // Connecting may need the save retried; either way it must reach the next step via the single free sign-in.
    const nextStep = page.getByRole("heading", { name: /what must not be sacrificed/i });
    if (!(await nextStep.isVisible().catch(() => false))) {
      await nextStep.waitFor({ timeout: 8_000 }).catch(async () => {
        await page.getByRole("button", { name: /save draft|save definition/i }).click();
        await nextStep.waitFor({ timeout: 20_000 });
      });
    }
    const signs = wallet.calls.filter((c) => c.method === "personal_sign");
    assert.ok(signs.length >= 1, "wallet sign-in happened after connect");
    assert.equal(wallet.calls.filter((c) => c.method === "eth_sendTransaction").length, 0, "no transaction");
    assert.deepEqual(ctx.consoleErrors, []);
  });

  scenario("first-run: 390px has no horizontal overflow, builder shows Connect", async () => {
    await mock.reset();
    ctx = await newSession();
    const page = await ctx.context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    for (const p of ["/", "/demo", "/app/guards/new"]) {
      await page.goto(p);
      await settle(page);
      assert.ok(await noOverflow(page), `no horizontal overflow at 390px on ${p}`);
    }
    const connect = page.locator('[data-wallet="connect"]').first();
    await connect.waitFor({ state: "visible", timeout: 10_000 });
  });
});
