import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POLL_CAP, operationViewFromTx, pollOutcome } from "./operations.ts";
import type { TxState } from "./wallet/tx-state.ts";

const HASH = "0x" + "1".repeat(64);
const confirming: TxState = { phase: "confirming", action: "arm_guard", hash: HASH, error: null };

describe("pending -> delayed -> check again", () => {
  it("plain pending stays confirming with no retry", () => {
    const view = operationViewFromTx(confirming)!;
    assert.equal(view.state, "confirming");
    assert.equal(view.retryMode, "none");
  });

  it("poll cap and retryable:false park the operation as delayed; terminal results stop", () => {
    assert.equal(pollOutcome({ state: "pending" }, 1), "continue");
    assert.equal(pollOutcome({ state: "pending" }, POLL_CAP), "stop-delayed");
    assert.equal(pollOutcome({ state: "unavailable", retryable: false }, 1), "stop-delayed");
    assert.equal(pollOutcome({ state: "reverted" }, 1), "stop-final");
    assert.equal(pollOutcome({ state: "reconciled" }, 1), "stop-final");
  });

  it("delayed view offers Check again, which is a reconcile (re-read), never a resend", () => {
    const view = operationViewFromTx({ ...confirming, delayed: true })!;
    assert.equal(view.state, "confirmation_delayed");
    assert.equal(view.retryMode, "reconcile");
    assert.equal(view.retryLabel, "Check again");
    assert.equal(view.txHash, HASH);
  });
});
