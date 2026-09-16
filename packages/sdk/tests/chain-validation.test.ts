import assert from "node:assert/strict";
import { test } from "node:test";
import { MetricMotiveError } from "../src/errors.ts";
import { parseChainGuard, parseOwnerGuardIds } from "../src/chain-validation.ts";

const valid = {
  found: true,
  id: 1,
  owner: "0x0000000000000000000000000000000000000001",
  motive: "motive",
  metric: "metric",
  guardrails_json: "[]",
  status: "RESOLVED",
  evidence_hash: "hash",
  evidence_json: "{}",
  findings_json: "{}",
  verdict: "FAITHFUL_SUCCESS",
  primary_pattern: "NONE",
};

test("chain responses are runtime validated", () => {
  assert.equal(parseChainGuard(valid).id, "1");
  assert.throws(
    () => parseChainGuard({ ...valid, status: { unexpected: true } }),
    (error: unknown) => error instanceof MetricMotiveError && error.code === "CHAIN_INVALID",
  );
  assert.deepEqual(parseOwnerGuardIds({ ids: [1, "2"] }), ["1", "2"]);
  assert.throws(() => parseOwnerGuardIds({ ids: [null] }), /Guard id is invalid/);
});
