// JS audit per page: every JS response fetched (name, raw and gzip bytes) and whether wallet or chain modules
// appear in the bodies. Read-only GETs. Usage: node js-audit.mjs <baseUrl> <outJson>
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const require = createRequire("/root/mm-release-v2/node_modules/playwright");
const { chromium } = require("playwright");
const [BASE, OUT] = process.argv.slice(2);
const PAGES = { landing: "/", demo: "/demo", receipt: "/verify/rct_14804bf62424284e", app: "/app" };
const WALLET = /walletconnect|rainbowkit|wagmi|@reown|appkit|viem|ethers/i;
const browser = await chromium.launch();
const out = {};
for (const [name, path] of Object.entries(PAGES)) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  const js = new Map();
  page.on("response", async (r) => {
    const u = r.url();
    if (!/\.m?js(\?|$)/.test(u) || r.status() !== 200) return;
    try { const body = await r.body(); js.set(u.split("/").pop().split("?")[0], body); } catch {}
  });
  await page.goto(BASE + path, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(4000);
  const files = [...js.entries()].map(([f, b]) => ({ f, raw: b.length, gz: gzipSync(b, { level: 9 }).length, wallet: WALLET.test(b.toString("utf8")) }));
  out[name] = { files: files.sort((a, b) => b.gz - a.gz), totalRaw: files.reduce((a, x) => a + x.raw, 0), totalGz: files.reduce((a, x) => a + x.gz, 0), walletFiles: files.filter((x) => x.wallet).map((x) => x.f) };
  await ctx.close();
}
await browser.close();
writeFileSync(OUT, JSON.stringify({ base: BASE, out }, null, 1));
for (const [k, v] of Object.entries(out)) console.log(k, "files", v.files.length, "gz", v.totalGz, "raw", v.totalRaw, "wallet", v.walletFiles.join(",") || "none");
