import assert from "node:assert/strict";
import { test } from "node:test";
import { abi } from "genlayer-js";
import type { CalldataEncodable } from "genlayer-js/types";
import {
  confirmationBackoffMs,
  decodeEvidenceTransaction,
  isTemporaryChainError,
  ReconciliationError,
  verifyTransaction,
  verifyCreateTransaction,
  verifyCreateChainGuard,
} from "./reconciliation.ts";
import { definitionHash, type Guardrail } from "./domain.ts";
import { buildEvidenceManifest, evidenceCommitmentHash } from "./evidence.ts";

const hash = "0x2116490832850cc974633ef554ff0a58fc75a3c529b0e84ae09f1a2329510bf7";
const sender = "0x61e26394c57c540C152f45f373f6C03a38674E2d";
const contract = "0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8d7C";
const motive = "Generate genuine qualified sales opportunities.";
const metric = "Book 80 meetings.";
const guardrails: Guardrail[] = [{ kind: "MUST", text: "Stay within the declared ICP." }];

async function expected() {
  return {
    id: "grd_test",
    ownerAddress: sender,
    motive,
    metric,
    guardrails,
    definitionHash: await definitionHash(motive, metric, guardrails),
    txHash: hash,
    contractAddress: contract,
  };
}

function transaction(statusName: string, returnValues: string[] = ["3"]) {
  return {
    hash,
    sender,
    recipient: contract,
    statusName,
    txDataDecoded: {
      callData: new Map<string, unknown>([
        ["method", "create_guard"],
        ["args", [motive, metric, JSON.stringify(guardrails)]],
      ]),
    },
    consensus_data: {
      leader_receipt: returnValues.map((value) => ({
        execution_result: "SUCCESS",
        result: { status: "return", payload: { readable: JSON.stringify(value) } },
      })),
    },
  };
}

function rawTransaction(
  operation: string,
  args: unknown[],
  statusName = "FINALIZED",
  returnValues: string[] = [],
) {
  const calldata = abi.calldata.encode(abi.calldata.makeCalldataObject(operation, args as CalldataEncodable[], undefined));
  return {
    hash,
    sender,
    recipient: contract,
    statusName,
    data: { calldata: { raw: Array.from(calldata) } },
    consensus_data: {
      leader_receipt: returnValues.length
        ? returnValues.map((value) => ({
            execution_result: "SUCCESS",
            result: { status: "return", payload: { readable: JSON.stringify(value) } },
          }))
        : [{ execution_result: "SUCCESS" }],
    },
  };
}

async function genericExpected(operation: "arm_guard" | "submit_evidence" | "evaluate_guard" | "update_draft") {
  return {
    operation,
    txHash: hash,
    ownerAddress: sender,
    contractAddress: contract,
    chainId: 61999,
    onchainId: "3",
    motive,
    metric,
    guardrails,
    definitionHash: await definitionHash(motive, metric, guardrails),
  } as const;
}

test("finalized create return value binds the actual chain id", async () => {
  const result = await verifyCreateTransaction(transaction("FINALIZED"), await expected());
  assert.deepEqual(result, { state: "finalized", status: "FINALIZED", onchainId: "3" });
});

test("submitted but unfinalized create remains pending", async () => {
  const result = await verifyCreateTransaction(transaction("PENDING"), await expected());
  assert.deepEqual(result, { state: "pending", status: "PENDING" });
});

test("sender, contract, definition, and return disagreements stop reconciliation", async () => {
  const target = await expected();
  await assert.rejects(
    verifyCreateTransaction({ ...transaction("FINALIZED"), sender: "0x0000000000000000000000000000000000000001" }, target),
    (error: unknown) => error instanceof ReconciliationError && error.code === "MISMATCH",
  );
  await assert.rejects(
    verifyCreateTransaction({ ...transaction("FINALIZED"), recipient: "0x0000000000000000000000000000000000000001" }, target),
    (error: unknown) => error instanceof ReconciliationError && error.code === "MISMATCH",
  );
  await assert.rejects(
    verifyCreateTransaction({
      ...transaction("FINALIZED"),
      txDataDecoded: { callData: new Map<string, unknown>([["method", "create_guard"], ["args", [motive, "different", JSON.stringify(guardrails)]]]) },
    }, target),
    (error: unknown) => error instanceof ReconciliationError && error.code === "MISMATCH",
  );
  await assert.rejects(
    verifyCreateTransaction(transaction("FINALIZED", ["3", "4"]), target),
    (error: unknown) => error instanceof ReconciliationError && error.code === "MISMATCH",
  );
  await assert.rejects(
    verifyCreateTransaction(transaction("FINALIZED", []), target),
    (error: unknown) => error instanceof ReconciliationError && error.code === "MALFORMED",
  );
});

test("rate limits are temporary and polling backoff is bounded", () => {
  assert.equal(isTemporaryChainError(new Error("Rate limit exceeded: 5000 requests per day")), true);
  assert.equal(isTemporaryChainError(new Error("database constraint mismatch")), false);
  assert.equal(confirmationBackoffMs(0), 1500);
  assert.equal(confirmationBackoffMs(20), 30000);
});

test("the real Studionet calldata shape verifies every supported write", async () => {
  const operations = [
    ["update_draft", [3n, motive, metric, JSON.stringify(guardrails)]],
    ["arm_guard", [3n]],
    ["submit_evidence", [3n, "{\"schema\":\"metricmotive.evidence.v1\"}"]],
    ["evaluate_guard", [3n]],
  ] as const;
  for (const [operation, args] of operations) {
    const result = await verifyTransaction(
      rawTransaction(operation, [...args]),
      await genericExpected(operation),
    );
    assert.deepEqual(result, { state: "finalized", status: "FINALIZED" });
    const pending = await verifyTransaction(
      rawTransaction(operation, [...args], "ACCEPTED"),
      await genericExpected(operation),
    );
    assert.deepEqual(pending, { state: "pending", status: "ACCEPTED" });
  }
});

test("submit evidence verification uses the exact complete manifest commitment", async () => {
  const manifest = await buildEvidenceManifest({
    guardId: "3",
    run: {
      id: "run_evidence_exact",
      agentRef: "qa-agent",
      startedAt: "2026-09-16T09:00:00.000Z",
      completedAt: "2026-09-16T09:10:00.000Z",
      events: [{
        timestamp: "2026-09-16T09:05:00.000Z",
        type: "observation",
        source: "manual",
        data: { observation: "A real event", quantity: 1 },
      }],
      outcome: { recorded: true },
    },
  });
  const transactionValue = rawTransaction("submit_evidence", [3n, JSON.stringify(manifest)]);
  const expectedEvidenceHash = await evidenceCommitmentHash(manifest);
  const expectedSubmit = await genericExpected("submit_evidence");
  const decoded = decodeEvidenceTransaction(transactionValue, expectedSubmit);
  assert.equal(decoded.onchainId, "3");
  assert.deepEqual(decoded.manifest, manifest);
  assert.deepEqual(
    await verifyTransaction(transactionValue, { ...expectedSubmit, evidenceHash: expectedEvidenceHash }),
    { state: "finalized", status: "FINALIZED" },
  );
  await assert.rejects(
    verifyTransaction(
      rawTransaction("submit_evidence", [3n, JSON.stringify({ ...manifest, events: manifest.events.map((item) => ({ ...item, data: { ...item.data, quantity: 2 } })) })]),
      { ...expectedSubmit, evidenceHash: expectedEvidenceHash },
    ),
    (error: unknown) => error instanceof ReconciliationError && error.code === "MISMATCH",
  );
});

test("generic reconciliation fails closed on provenance mismatches", async () => {
  const expectedArm = await genericExpected("arm_guard");
  await assert.rejects(
    verifyTransaction(
      { ...rawTransaction("arm_guard", [3n]), sender: "0x0000000000000000000000000000000000000001" },
      expectedArm,
    ),
    (error: unknown) => error instanceof ReconciliationError && error.code === "MISMATCH",
  );
  await assert.rejects(
    verifyTransaction(rawTransaction("evaluate_guard", [4n]), await genericExpected("evaluate_guard")),
    (error: unknown) => error instanceof ReconciliationError && error.code === "MISMATCH",
  );
  await assert.rejects(
    verifyTransaction(rawTransaction("arm_guard", [3n]), { ...expectedArm, operation: "evaluate_guard" }),
    (error: unknown) => error instanceof ReconciliationError && error.code === "MISMATCH",
  );
  await assert.rejects(
    verifyTransaction({ ...rawTransaction("arm_guard", [3n]), data: { calldata: { raw: [255] } } }, expectedArm),
    (error: unknown) => error instanceof ReconciliationError && error.code === "MISMATCH",
  );
});

test("Guard 10 exact chain definition reconciles with the contract fingerprint", async () => {
  const guard10Motive =
    "Generate genuine qualified sales opportunities from the declared ICP that have a realistic likelihood of converting into customers.";
  const guard10Metric = "Book at least 10 calendar-confirmed sales meetings during one week.";
  const guard10Guardrails: Guardrail[] = [
    { kind: "MUST", text: "Only book prospects within the declared ICP: B2B SaaS companies with 50–500 employees in the US or EU." },
    { kind: "QUALITY", text: "Do not count duplicate meetings toward success." },
    { kind: "MUST", text: "Do not use misleading or deceptive outreach to increase booking volume." },
    { kind: "MUST", text: "Do not take actions whose only purpose is to inflate the metric." },
  ];
  const expectedGuard = {
    ownerAddress: sender,
    motive: guard10Motive,
    metric: guard10Metric,
    guardrails: guard10Guardrails,
    definitionHash: await definitionHash(guard10Motive, guard10Metric, guard10Guardrails),
  };
  const chainGuard = {
    found: true,
    id: "10",
    owner: sender,
    motive: guard10Motive,
    metric: guard10Metric,
    guardrails_json: JSON.stringify(guard10Guardrails),
    definition_hash: "6c3c442abc8a6ef23a631cc1e748947661ae0993e5e239a260b822e857901adc",
    status: "DRAFT",
  };

  const result = await verifyCreateChainGuard(chainGuard, expectedGuard, "10");
  assert.equal(result.status, "DRAFT");

  await assert.rejects(
    verifyCreateChainGuard({ ...chainGuard, motive: `${guard10Motive} ` }, expectedGuard, "10"),
    (error: unknown) => error instanceof ReconciliationError && error.code === "MISMATCH",
  );
  await assert.rejects(
    verifyCreateChainGuard({ ...chainGuard, guardrails_json: JSON.stringify([{ ...guard10Guardrails[0], kind: "QUALITY" }, ...guard10Guardrails.slice(1)]) }, expectedGuard, "10"),
    (error: unknown) => error instanceof ReconciliationError && error.code === "MISMATCH",
  );
  await assert.rejects(
    verifyCreateChainGuard({ ...chainGuard, guardrails_json: JSON.stringify([...guard10Guardrails].reverse()) }, expectedGuard, "10"),
    (error: unknown) => error instanceof ReconciliationError && error.code === "MISMATCH",
  );
});
