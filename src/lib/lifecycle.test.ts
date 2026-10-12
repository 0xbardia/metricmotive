import assert from "node:assert/strict";
import test from "node:test";
import { getGuardLifecyclePresentation, isEvidenceCommitted, isEvidenceCommitting } from "./lifecycle.ts";

const base = { authority: "GENLAYER", published: true } as const;

test("DRAFT shows Draft step", () => {
  const l = getGuardLifecyclePresentation({ ...base, guardStatus: "DRAFT" });
  assert.equal(l.stepLabel, "Draft");
});
test("lock in flight shows Lock, not Draft", () => {
  const l = getGuardLifecyclePresentation({ ...base, guardStatus: "DRAFT", lockInFlight: true });
  assert.equal(l.stage, "DRAFT");
  assert.equal(l.stepLabel, "Lock");
  assert.deepEqual(l.stepStates, ["complete", "current", "upcoming", "upcoming"]);
});
test("ARMED without txArm is an unconfirmed lock, not Run", () => {
  const l = getGuardLifecyclePresentation({ ...base, guardStatus: "ARMED" });
  assert.equal(l.stage, "DRAFT");
  assert.equal(l.stepLabel, "Lock");
  assert.equal(l.lockState, "PUBLISHED_NOT_LOCKED");
});
test("ARMED with txArm advances to Run", () => {
  const l = getGuardLifecyclePresentation({ ...base, guardStatus: "ARMED", lockRecorded: true });
  assert.equal(l.stepLabel, "Run");
});
test("evidence predicate: hash vs unreconciled tx", () => {
  assert.equal(isEvidenceCommitted({ evidenceHash: "0xa", txEvidence: "0xb" }), true);
  assert.equal(isEvidenceCommitted({ evidenceHash: null, txEvidence: "0xb" }), false);
  assert.equal(isEvidenceCommitting({ evidenceHash: null, txEvidence: "0xb" }), true);
  assert.equal(isEvidenceCommitting({ evidenceHash: "0xa", txEvidence: "0xb" }), false);
});
test("unreconciled evidence tx is committing, not verify-ready", () => {
  const l = getGuardLifecyclePresentation({
    ...base, guardStatus: "ARMED", lockRecorded: true, evidenceCommitting: true,
  });
  assert.notEqual(l.nextAction.kind, "continue-to-verification");
  assert.equal(l.stepLabel, "Verify");
});
