import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { clearPendingTx, loadPendingTx, persistPendingTx, type TxState } from "./tx-state.ts";

const store = new Map<string, string>();
(globalThis as any).window = {
  localStorage: {
    get length() { return store.size; },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
};

const tx = (resourceId: string, action: string, hash: string): TxState => ({
  phase: "pending", action, hash, error: null, resourceId,
});

describe("pending tx storage", () => {
  beforeEach(() => store.clear());

  it("keys per guard and operation without collision", () => {
    persistPendingTx(tx("g1", "arm_guard", "0xa"));
    persistPendingTx(tx("g1", "submit_evidence", "0xb"));
    persistPendingTx(tx("g2", "arm_guard", "0xc"));
    assert.equal(loadPendingTx("g1", "arm_guard").hash, "0xa");
    assert.equal(loadPendingTx("g1", "submit_evidence").hash, "0xb");
    assert.equal(loadPendingTx("g2").hash, "0xc");
    clearPendingTx("g1", "arm_guard");
    assert.equal(loadPendingTx("g1", "arm_guard").phase, "idle");
    assert.equal(loadPendingTx("g1", "submit_evidence").hash, "0xb");
  });

  it("applies the legacy key only to its own guard", () => {
    store.set(
      "metricmotive.pending-transaction",
      JSON.stringify({ ...tx("g1", "arm_guard", "0xold"), savedAt: Date.now() }),
    );
    assert.equal(loadPendingTx("g2").phase, "idle");
    assert.equal(loadPendingTx("g1").hash, "0xold");
    assert.equal(store.has("metricmotive.pending-transaction"), false);
  });
});
