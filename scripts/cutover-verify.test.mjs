import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CONTRACT, ROUTES, extractAssetStrings, extractAssets, parseArgs, validateReady } from "./cutover-verify.mjs";

test("route list is the eight CUTOVER.md routes", () => {
  assert.deepEqual(ROUTES, ["/", "/demo", "/docs", "/contract", "/roadmap", "/verify/rct_14804bf62424284e", "/app", "/app/guards/new"]);
});

test("extractAssets: local href/src, modulepreload, stylesheet; not external or protocol-relative", () => {
  const html = `<link rel="modulepreload" href="/assets/a-1.js"><link rel=stylesheet href='/assets/s.css?v=1'>
    <script src="/assets/main-2.js" type="module"></script><img src="//cdn.x/y.png"><a href="https://x.y/z">x</a>
    <a href="/docs#top">docs</a><a href="#local">l</a><link rel="icon" href="/favicon.svg">`;
  assert.deepEqual(extractAssets(html), ["/assets/a-1.js", "/assets/main-2.js", "/assets/s.css", "/docs", "/favicon.svg"]);
});

test("extractAssetStrings finds /assets/* inside JS", () => {
  const js = `import("/assets/chunk-AbC_1.js");x="/assets/font.woff2";y="/assets/";z="/api/assets/no"`;
  assert.deepEqual(extractAssetStrings(js), ["/assets/chunk-AbC_1.js", "/assets/font.woff2"]);
});

test("validateReady", () => {
  const ok = { status: "ready", db: true, chainId: 61997, contractAddress: DEFAULT_CONTRACT.toLowerCase() };
  assert.deepEqual(validateReady(ok), []);
  assert.match(validateReady({ ...ok, db: false }).join(), /db/);
  assert.match(validateReady({ ...ok, chainId: 1 }).join(), /chainId/);
  assert.match(validateReady({ ...ok, status: "starting" }).join(), /status/);
  assert.match(validateReady(ok, { contract: "0x0000000000000000000000000000000000000001" }).join(), /contractAddress/);
  assert.match(validateReady(null).join(), /not a JSON object/);
});

test("parseArgs requires --base", () => {
  assert.match(parseArgs([]).error, /--base/);
  assert.match(parseArgs(["--base", "nope"]).error, /--base/);
  assert.match(parseArgs(["--base", "http://x", "--bogus", "1"]).error, /unknown/);
  const o = parseArgs(["--base", "http://127.0.0.1:1/", "--release-dir", "/r", "--expect-chain", "5"]);
  assert.deepEqual([o.base, o.releaseDir, o.chain, o.contract], ["http://127.0.0.1:1", "/r", 5, DEFAULT_CONTRACT]);
});
