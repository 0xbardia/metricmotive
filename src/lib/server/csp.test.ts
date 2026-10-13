import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCsp, newNonce } from "./csp.ts";

test("nonce is 16 random bytes, base64, unique per call", () => {
  const a = newNonce();
  assert.match(a, /^[A-Za-z0-9+/]{22}==$/);
  assert.notEqual(a, newNonce());
});

test("buildCsp swaps unsafe-inline for the nonce in script-src only", () => {
  const withNonce = buildCsp("abc==");
  assert.match(withNonce, /script-src 'self' 'nonce-abc=='(;|$)/);
  assert.doesNotMatch(withNonce, /script-src[^;]*unsafe-inline/);
  assert.match(buildCsp(), /script-src 'self' 'unsafe-inline'/);
  for (const csp of [withNonce, buildCsp()]) {
    assert.match(csp, /walletconnect/);
    assert.match(csp, /studio\.genlayer\.com/);
    assert.match(csp, /coinbase/);
  }
});
