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
    assert.equal(pollOutcome({ state: "failed" }, 1), "stop-final");
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

it("a failed transaction renders the server's failed recovery message, not the mismatch copy", async () => {
  const { FAILED_RECOVERY_MESSAGE } = await import("./server/operation-store.ts");
  const view = operationViewFromTx({
    phase: "failed",
    action: "arm_guard",
    hash: "0x" + "c".repeat(64),
    error: FAILED_RECOVERY_MESSAGE,
    failureKind: "failed",
  });
  assert.equal(view?.title, "Transaction failed on GenLayer");
  assert.equal(view?.message, FAILED_RECOVERY_MESSAGE);
});

describe("copy and busy (B-09, B-17)", () => {
  it("lock success says locked, not armed", () => {
    const v = operationViewFromTx({
      phase: "success", action: "arm_guard", hash: "0xabc", error: null,
    } as TxState);
    assert.match(`${v?.title} ${v?.message}`, /locked/i);
    assert.doesNotMatch(`${v?.title} ${v?.message}`, /armed/i);
  });
  it("confirmation_delayed is not busy", () => {
    const v = operationViewFromTx({
      phase: "confirming", action: "arm_guard", hash: "0xabc", error: "rpc timeout",
    } as TxState);
    assert.equal(v?.state, "confirmation_delayed");
    assert.equal(v?.busy, false);
  });
});

describe("blocked failure kinds", () => {
  const failed = (failureKind: TxState["failureKind"]): TxState => ({
    phase: "failed", action: "arm_guard", hash: HASH, error: "recover", failureKind,
  });
  it("mismatch/failed are blocked with no retry; reverted retries via a fresh write", async () => {
    const { isBlockedFailure } = await import("./wallet/tx-state.ts");
    for (const k of ["mismatch", "failed"] as const) {
      assert.equal(isBlockedFailure(failed(k)), true);
      assert.equal(operationViewFromTx(failed(k))!.retryMode, "none");
      assert.equal(operationViewFromTx(failed(k))!.message, "recover");
    }
    assert.equal(isBlockedFailure(failed("reverted")), false);
  });
});
