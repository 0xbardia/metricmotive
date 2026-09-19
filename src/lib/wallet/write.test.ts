import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  LIFECYCLE_WRITE_METHODS,
  assertActiveLifecycleTarget,
  sameWriteDescriptor,
  submitLifecycleWrite,
  LifecycleWriteError,
  type LifecycleWriteDeps,
  type LifecycleWriteDescriptor,
} from "./write.ts";
import { operationViewFromTx } from "../operations.ts";

const ACTIVE = "0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703";
const HISTORICAL = "0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d";
const ACCOUNT = "0x0cAC7830d185fe154d7B83A81a1679c4BeDf0a8b";

const write: LifecycleWriteDescriptor = {
  address: ACTIVE,
  functionName: "create_guard",
  args: ["motive", "metric", "[]"],
};

function deps(overrides: Partial<LifecycleWriteDeps> & { log?: { estimates: number; writes: number } }): LifecycleWriteDeps {
  const log = overrides.log ?? { estimates: 0, writes: 0 };
  return {
    estimateTransactionFeesForWrite: async (descriptor) => {
      log.estimates += 1;
      assert.equal(descriptor.functionName, write.functionName);
      assert.equal(descriptor.address, write.address);
      assert.deepEqual(descriptor.args, write.args);
      return { distribution: { leaderTimeunitsAllocation: 100n }, feeValue: 1000n };
    },
    getBalance: async () => 10_000n,
    writeContract: async (input) => {
      log.writes += 1;
      assert.equal(input.functionName, write.functionName);
      assert.equal(input.address, write.address);
      assert.deepEqual(input.args, write.args);
      assert.deepEqual(input.fees.distribution, { leaderTimeunitsAllocation: 100n });
      assert.equal(input.fees.feeValue, 1000n);
      return `0x${"ab".repeat(32)}`;
    },
    waitForFinalization: async () => ({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" }),
    isSuccessful: () => true,
    ...overrides,
  };
}

test("estimateTransactionFeesForWrite runs before writeContract", async () => {
  const order: string[] = [];
  const log = { estimates: 0, writes: 0 };
  await submitLifecycleWrite(
    { account: ACCOUNT, write, chainId: 61997 },
    deps({
      log,
      estimateTransactionFeesForWrite: async () => {
        order.push("estimate");
        log.estimates += 1;
        return { distribution: { ok: true }, feeValue: 1n };
      },
      writeContract: async (input) => {
        order.push("write");
        log.writes += 1;
        assert.deepEqual(input.fees.distribution, { ok: true });
        assert.equal(input.fees.feeValue, 1n);
        return `0x${"cd".repeat(32)}`;
      },
    }),
  );
  assert.deepEqual(order, ["estimate", "write"]);
  assert.equal(log.estimates, 1);
  assert.equal(log.writes, 1);
});

test("distribution and feeValue are passed unchanged", async () => {
  const distribution = { leaderTimeunitsAllocation: 7n, rotations: [3n] };
  await submitLifecycleWrite(
    { account: ACCOUNT, write, chainId: 61997 },
    deps({
      estimateTransactionFeesForWrite: async () => ({ distribution, feeValue: 42n }),
      writeContract: async (input) => {
        assert.equal(input.fees.distribution, distribution);
        assert.equal(input.fees.feeValue, 42n);
        return `0x${"11".repeat(32)}`;
      },
    }),
  );
});

test("zero or omitted fee cannot reach writeContract", async () => {
  let writes = 0;
  await assert.rejects(
    submitLifecycleWrite(
      { account: ACCOUNT, write, chainId: 61997 },
      deps({
        estimateTransactionFeesForWrite: async () => ({ distribution: {}, feeValue: 0n }),
        writeContract: async () => {
          writes += 1;
          return `0x${"11".repeat(32)}`;
        },
      }),
    ),
    (err: unknown) => err instanceof LifecycleWriteError && err.code === "FEE_ESTIMATION_FAILED",
  );
  assert.equal(writes, 0);
});

test("estimate and submit descriptors are identical", () => {
  assert.equal(sameWriteDescriptor(write, { ...write }), true);
  assert.equal(sameWriteDescriptor(write, { ...write, functionName: "arm_guard" }), false);
});

test("insufficient wallet balance prevents writeContract", async () => {
  let writes = 0;
  await assert.rejects(
    submitLifecycleWrite(
      { account: ACCOUNT, write, chainId: 61997 },
      deps({
        getBalance: async () => 0n,
        writeContract: async () => {
          writes += 1;
          return `0x${"11".repeat(32)}`;
        },
      }),
    ),
    (err: unknown) => err instanceof LifecycleWriteError && err.code === "INSUFFICIENT_GEN_FOR_FEES",
  );
  assert.equal(writes, 0);
});

test("fee estimation failure prevents writeContract", async () => {
  let writes = 0;
  await assert.rejects(
    submitLifecycleWrite(
      { account: ACCOUNT, write, chainId: 61997 },
      deps({
        estimateTransactionFeesForWrite: async () => {
          throw new Error("rpc down");
        },
        writeContract: async () => {
          writes += 1;
          return `0x${"11".repeat(32)}`;
        },
      }),
    ),
    (err: unknown) => err instanceof LifecycleWriteError && err.code === "FEE_ESTIMATION_FAILED",
  );
  assert.equal(writes, 0);
});

for (const method of LIFECYCLE_WRITE_METHODS) {
  test(`${method} uses the fee-aware path`, () => {
    assert.equal(isLifecycleWriteMethod(method), true);
    const source = readFileSync("src/lib/wallet/write.ts", "utf8");
    assert.match(source, /estimateTransactionFeesForWrite/);
    assert.match(source, /account:\s*\{\s*address:\s*descriptor\.account/);
    assert.match(source, /fees:\s*\{/);
    assert.match(source, /feeValue/);
    assert.match(source, /distribution/);
    assert.doesNotMatch(source, /378536400010352/);
    assert.match(source, new RegExp(`"${method}"`));
  });
}

test("historical 61999 mutation is blocked before estimation", async () => {
  let estimates = 0;
  assert.throws(
    () => assertActiveLifecycleTarget(61999, HISTORICAL),
    (err: unknown) => err instanceof LifecycleWriteError && err.code === "HISTORICAL_DEPLOYMENT_READ_ONLY",
  );
  await assert.rejects(
    submitLifecycleWrite(
      { account: ACCOUNT, write: { ...write, address: HISTORICAL }, chainId: 61999 },
      deps({
        estimateTransactionFeesForWrite: async () => {
          estimates += 1;
          return { distribution: {}, feeValue: 1n };
        },
      }),
    ),
    (err: unknown) => err instanceof LifecycleWriteError && err.code === "HISTORICAL_DEPLOYMENT_READ_ONLY",
  );
  assert.equal(estimates, 0);
});

test("finalization success uses isSuccessful", async () => {
  let checked = false;
  await submitLifecycleWrite(
    { account: ACCOUNT, write, chainId: 61997 },
    deps({
      isSuccessful: (tx) => {
        checked = true;
        return Boolean(tx);
      },
    }),
  );
  assert.equal(checked, true);
});

test("failed execution is not success merely because consensus finalized", async () => {
  let writes = 0;
  await assert.rejects(
    submitLifecycleWrite(
      { account: ACCOUNT, write, chainId: 61997 },
      deps({
        writeContract: async () => {
          writes += 1;
          return `0x${"ee".repeat(32)}`;
        },
        waitForFinalization: async () => ({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_ERROR" }),
        isSuccessful: () => false,
      }),
    ),
    (err: unknown) => err instanceof LifecycleWriteError && err.code === "WRITE_NOT_SUCCESSFUL",
  );
  assert.equal(writes, 1);
});

test("timeout after a GenLayer hash does not auto-resubmit", async () => {
  let writes = 0;
  await assert.rejects(
    submitLifecycleWrite(
      { account: ACCOUNT, write, chainId: 61997 },
      deps({
        writeContract: async () => {
          writes += 1;
          return `0x${"aa".repeat(32)}`;
        },
        waitForFinalization: async () => {
          throw new Error("wait timed out");
        },
      }),
    ),
    /wait timed out/,
  );
  assert.equal(writes, 1);
});

test("UI failure copy no longer hardcodes Studionet", () => {
  const view = operationViewFromTx({
    phase: "failed",
    action: "create_guard",
    hash: null,
    error: "no",
  });
  assert.equal(view?.message, "The transaction was not accepted. No on-chain state was created.");
  assert.doesNotMatch(view?.message ?? "", /Studionet/);
  const source = readFileSync("src/lib/operations.ts", "utf8");
  assert.doesNotMatch(source, /Nothing was written to Studionet/);
});

function isLifecycleWriteMethod(name: string) {
  return (LIFECYCLE_WRITE_METHODS as readonly string[]).includes(name);
}

test("chain-actions routes every product write through writeIntelligentContract", () => {
  const source = readFileSync("src/components/chain-actions.tsx", "utf8");
  assert.match(source, /writeIntelligentContract/);
  for (const method of ["create_guard", "arm_guard", "submit_evidence", "evaluate_guard"]) {
    assert.match(source, new RegExp(`functionName: "${method}"`));
  }
});
