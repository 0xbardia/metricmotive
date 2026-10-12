import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { requireWallet } from "./require-wallet.ts";

test("missing wallet opens the modal once and throws the message", () => {
  for (const w of [{}, { address: "0xa" }, { connector: {} }, { address: null, connector: null }]) {
    let n = 0;
    assert.throws(() => requireWallet(w, () => n++, "Connect a wallet before X."), { message: "Connect a wallet before X." });
    assert.equal(n, 1);
  }
});

test("connected wallet is returned and connect is not called", () => {
  const connector = {};
  let n = 0;
  assert.deepEqual(requireWallet({ address: "0xa", connector }, () => n++, "m"), { address: "0xa", connector });
  assert.equal(n, 0);
});

test("all guarded sites use requireWallet", () => {
  for (const [f, count] of [["src/routes/app/guards/$id.tsx", 3], ["src/routes/app/runs/$id.tsx", 3], ["src/components/app-home-content.tsx", 1]] as const) {
    assert.equal(readFileSync(f, "utf8").split("requireWallet(").length - 1, count, f);
  }
});
