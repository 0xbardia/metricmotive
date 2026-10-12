// Injected EIP-1193 wallet (EIP-6963 + window.ethereum), backed by a fixed TEST
// private key. Signing / tx calls cross to Node via a Playwright binding; no
// transaction ever reaches a network.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

export const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // public test key, never funded
export const CHAIN_HEX = "0xf22d"; // 61997

/** Browser-side script. `cfg` is JSON-injected: { address, timeScale }. */
function browserSource() {
  const cfg = window.__MM_E2E_CFG;
  const listeners = {};
  const emit = (ev, ...a) => (listeners[ev] ?? []).forEach((f) => { try { f(...a); } catch {} });
  const provider = {
    isMetaMask: false,
    isE2EWallet: true,
    on(ev, f) { (listeners[ev] ??= []).push(f); return provider; },
    addListener(ev, f) { return provider.on(ev, f); },
    removeListener(ev, f) { listeners[ev] = (listeners[ev] ?? []).filter((x) => x !== f); return provider; },
    off(ev, f) { return provider.removeListener(ev, f); },
    async request({ method, params }) {
      switch (method) {
        case "eth_chainId": return cfg.chainHex;
        case "net_version": return String(parseInt(cfg.chainHex, 16));
        case "eth_accounts":
        case "eth_requestAccounts": return window.__mmConnected ? [cfg.address] : (method === "eth_requestAccounts" ? ((window.__mmConnected = true), [cfg.address]) : []);
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
        case "wallet_requestPermissions":
          return null;
        case "wallet_getPermissions": return [];
        case "personal_sign":
        case "eth_sign":
        case "eth_signTypedData_v4":
        case "eth_sendTransaction":
        case "eth_sendRawTransaction":
        case "eth_signTransaction":
          return window.__mmWallet(method, params ?? []);
        default:
          // read-only: ask the (routed) RPC
          return window.__mmWallet("passthrough:" + method, params ?? []);
      }
    },
  };
  window.__mmConnected = false;
  window.__mmDisconnect = () => {
    window.__mmConnected = false;
    emit("accountsChanged", []);
    emit("disconnect", { code: 4900, message: "disconnected" });
  };
  window.ethereum = provider;
  const info = { uuid: "e2e-0000-0000-0000-000000000001", name: "E2E Test Wallet", icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiBmaWxsPSIjMzMzIi8+PC9zdmc+", rdns: "io.metricmotive.e2e" };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();

  // Test-only time control: shorten long timers so poll caps/backoffs finish fast.
  if (cfg.timeScale > 1) {
    const st = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...rest) => st(fn, typeof ms === "number" && ms > 200 ? Math.max(20, ms / cfg.timeScale) : ms, ...rest);
  }
}

export function initScript(cfg) {
  return `window.__MM_E2E_CFG = ${JSON.stringify(cfg)}; (${browserSource.toString()})();`;
}

/**
 * Wire the wallet into a BrowserContext. Returns a control object:
 *   calls          every wallet call: { tab, method, hash? }
 *   hold()         makes the next eth_sendTransaction wait; returns release()
 *   rejectNext()   next eth_sendTransaction fails with EIP-1193 4001
 */
export async function installWallet(context, { appDir, mockUrl, rpcUrl, timeScale = 1 }) {
  const require = createRequire(join(appDir, "package.json"));
  const viem = await import(pathToFileURL(require.resolve("viem")).href);
  const accounts = await import(pathToFileURL(require.resolve("viem/accounts")).href);
  const gl = await import(pathToFileURL(require.resolve("genlayer-js/chains")).href);
  const account = accounts.privateKeyToAccount(TEST_PRIVATE_KEY);
  const consensusAbi = gl.studioDevnet.consensusMainContract.abi;

  const wallet = { address: account.address, calls: [], sent: [], _hold: null, _reject: false };
  let counter = 0;
  const seed = Math.random().toString(16).slice(2);

  wallet.hold = () => {
    let release;
    wallet._hold = new Promise((r) => (release = r));
    return () => { release(); };
  };
  /** Drop the wallet connection in `page` without reloading (EIP-1193 accountsChanged([]) + disconnect). */
  wallet.disconnect = (page) => page.evaluate(() => window.__mmDisconnect());
  wallet.rejectNext = () => { wallet._reject = true; };
  wallet.callsFrom = (tab, ...methods) => wallet.calls.filter((c) => c.tab === tab && (!methods.length || methods.includes(c.method)));

  await context.exposeBinding("__mmWallet", async ({ page }, method, params) => {
    const tab = context.pages().indexOf(page);
    const entry = { tab, method };
    wallet.calls.push(entry);
    if (method.startsWith("passthrough:")) {
      const res = await fetch(`${mockUrl}/rpc`, {
        method: "POST", headers: { "content-type": "application/json", "x-mm-source": "browser" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method.slice(12), params }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error.message);
      return res.result;
    }
    if (method === "personal_sign") {
      const msg = params[0];
      return account.signMessage({ message: viem.isHex(msg) && !msg.includes(" ") ? { raw: msg } : msg });
    }
    if (method === "eth_sendTransaction") {
      if (wallet._hold) { const h = wallet._hold; wallet._hold = null; await h; }
      if (wallet._reject) { wallet._reject = false; throw Object.assign(new Error("User rejected the request."), { code: 4001 }); }
      const tx = params[0];
      const decoded = viem.decodeFunctionData({ abi: consensusAbi, data: tx.data });
      const p = decoded.args[0];
      const hash = viem.keccak256(viem.toHex(`mm-e2e:${seed}:${counter++}`));
      const reg = await fetch(`${mockUrl}/__control/register-tx`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ hash, from: account.address, to: p.recipient, txCalldata: p.txCalldata }),
      }).then((r) => r.json());
      entry.hash = hash;
      entry.registered = reg;
      wallet.sent.push({ tab, hash, ...reg });
      return hash;
    }
    throw new Error(`E2E wallet: unsupported method ${method}`);
  });

  await context.addInitScript(initScript({ address: account.address, chainHex: CHAIN_HEX, timeScale }));
  // Browser-side reads of the GenLayer RPC go to the mock.
  await context.route(`${rpcUrl}**`, async (route) => {
    const req = route.request();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const res = await fetch(`${mockUrl}/rpc`, {
      method: "POST", headers: { "content-type": "application/json", "x-mm-source": "browser" }, body: req.postData() ?? "{}",
    });
    await route.fulfill({ status: res.status, headers: { ...cors, "content-type": "application/json" }, body: await res.text() });
  });
  return wallet;
}
