import test from "node:test";
import assert from "node:assert/strict";
import { DEPLOYMENT, LEGACY_DEPLOYMENT, guardDeployment } from "./contract.ts";
import { createGuardIdempotencyKey } from "./create-intent.ts";

const draft = { onchainId: null, txCreate: null, txCreateContract: null, txCreateChainId: null };

test("new Guard defaults to current deployment; legacy ID retains provenance", () => {
  assert.equal(guardDeployment(draft).contractAddress, DEPLOYMENT.contractAddress);
  const legacy = { ...draft, onchainId: "10", contractAddress: LEGACY_DEPLOYMENT.contractAddress, chainId: 61999 };
  const current = { ...legacy, contractAddress: DEPLOYMENT.contractAddress };
  assert.equal(guardDeployment(legacy).contractAddress, LEGACY_DEPLOYMENT.contractAddress);
  assert.equal(guardDeployment(current).contractAddress, DEPLOYMENT.contractAddress);
  assert.notDeepEqual(guardDeployment(legacy), guardDeployment(current));
  assert.equal(guardDeployment({ ...draft, onchainId: "10", txCreateContract: LEGACY_DEPLOYMENT.contractAddress }).contractAddress, LEGACY_DEPLOYMENT.contractAddress);
  assert.throws(() => guardDeployment({ ...draft, onchainId: "10" }), /provenance is missing/);
  assert.throws(() => guardDeployment({ ...legacy, chainId: 1 }), /Unsupported/);
  const intent = { wallet: "0x123", guardId: "local", version: 1, definitionHash: "hash", ...guardDeployment(legacy) };
  assert.notEqual(createGuardIdempotencyKey(intent), createGuardIdempotencyKey({ ...intent, ...guardDeployment(current) }));
});
