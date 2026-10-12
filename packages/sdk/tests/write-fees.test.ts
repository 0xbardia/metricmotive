import assert from "node:assert/strict";
import { test } from "node:test";
import { MetricMotiveClient } from "../src/index.ts";

const ACCOUNT = { address: "0x1111111111111111111111111111111111111111" };

function make(over: Record<string, unknown> = {}, execution: unknown = "SUCCESS") {
  const calls: Record<string, unknown>[] = [];
  const chain = {
    estimateTransactionFeesForWrite: async () => ({ distribution: { d: 1 }, feeValue: 10n }),
    request: async () => "0x64",
    writeContract: async (a: Record<string, unknown>) => {
      calls.push(a);
      return "0xabc";
    },
    waitForTransactionReceipt: async () => ({
      consensus_data: { leader_receipt: execution == null ? [] : [{ execution_result: execution }] },
    }),
    ...over,
  };
  const client = new MetricMotiveClient({ account: ACCOUNT as never, clientFactory: () => chain });
  return { client, calls };
}

test("fee estimation failure sends no tx", async () => {
  const { client, calls } = make({ estimateTransactionFeesForWrite: async () => { throw new Error("x"); } });
  await assert.rejects(client.armGuard(1), { code: "FEE_ESTIMATION_FAILED" });
  assert.equal(calls.length, 0);
});

for (const bad of [{ distribution: {}, feeValue: 0n }, { distribution: {}, feeValue: null }, { distribution: null, feeValue: 5n }]) {
  test(`unusable estimate ${String(bad.feeValue)}/${bad.distribution === null} sends no tx`, async () => {
    const { client, calls } = make({ estimateTransactionFeesForWrite: async () => bad });
    await assert.rejects(client.armGuard(1), { code: "FEE_ESTIMATION_FAILED" });
    assert.equal(calls.length, 0);
  });
}

test("insufficient balance sends no tx", async () => {
  const { client, calls } = make({ request: async () => "0x1" });
  await assert.rejects(client.armGuard(1), { code: "INSUFFICIENT_GEN_FOR_FEES" });
  assert.equal(calls.length, 0);
});

test("write passes fees and no value", async () => {
  const { client, calls } = make({
    readContract: async () => ({ id: 1, status: "ARMED" }),
  });
  await client.armGuard(1).catch(() => undefined);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].fees, { distribution: { d: 1 }, feeValue: 10n });
  assert.equal("value" in calls[0], false);
});

test("finalized write with empty execution fails", async () => {
  const { client } = make({}, null);
  await assert.rejects(client.evaluateGuard(1), { code: "EXECUTION_FAILED" });
});
