import test from "node:test";
import assert from "node:assert/strict";
import { DEPLOYMENT, LEGACY_DEPLOYMENT, HISTORICAL_DEPLOYMENT, guardDeployment } from "./contract.ts";
import { createGuardIdempotencyKey } from "./create-intent.ts";

const draft = { onchainId: null, txCreate: null, txCreateContract: null, txCreateChainId: null };

test("new Guard defaults to current deployment; historical ID retains provenance", () => {
  assert.equal(guardDeployment(draft).contractAddress, DEPLOYMENT.contractAddress);
  assert.equal(guardDeployment(draft).chainId, 61997);
  const historical = { ...draft, onchainId: "1", contractAddress: HISTORICAL_DEPLOYMENT.contractAddress, chainId: 61999 };
  const legacy = { ...draft, onchainId: "10", contractAddress: LEGACY_DEPLOYMENT.contractAddress, chainId: 61999 };
  const current = { ...draft, onchainId: "1", contractAddress: DEPLOYMENT.contractAddress, chainId: 61997 };
  assert.equal(guardDeployment(historical).contractAddress, HISTORICAL_DEPLOYMENT.contractAddress);
  assert.equal(guardDeployment(historical).chainId, 61999);
  assert.equal(guardDeployment(legacy).contractAddress, LEGACY_DEPLOYMENT.contractAddress);
  assert.equal(guardDeployment(current).contractAddress, DEPLOYMENT.contractAddress);
  assert.notDeepEqual(guardDeployment(historical), guardDeployment(current));
  assert.equal(guardDeployment({ ...draft, onchainId: "10", txCreateContract: LEGACY_DEPLOYMENT.contractAddress }).contractAddress, LEGACY_DEPLOYMENT.contractAddress);
  assert.throws(() => guardDeployment({ ...draft, onchainId: "10" }), /provenance is missing/);
  assert.throws(() => guardDeployment({ ...historical, chainId: 1 }), /Unsupported/);
  const intent = { wallet: "0x123", guardId: "local", version: 1, definitionHash: "hash", ...guardDeployment(historical) };
  assert.notEqual(createGuardIdempotencyKey(intent), createGuardIdempotencyKey({ ...intent, ...guardDeployment(current) }));
});
