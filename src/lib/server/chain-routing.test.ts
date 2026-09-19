import assert from "node:assert/strict";
import test from "node:test";
import { studioDevnet, studionet } from "genlayer-js/chains";
import {
  getActiveDeployment,
  getDeploymentByChainAndContract,
} from "../../../packages/sdk/src/deployment.ts";
import { genLayerChainForDeployment } from "../../../packages/sdk/src/chain-preset.ts";
import { MetricMotiveClient } from "../../../packages/sdk/src/client.ts";
import { guardDeployment, requireActiveWrite, resolvedDeployment } from "../contract.ts";
import { AppError } from "../errors.ts";
import { monotonicTransactionStatus, transactionStatusRank } from "../reconciliation.ts";
import { getReadClientForProvenance, transactionIdentity } from "./chain-client.ts";

const draft = {
  onchainId: null,
  txCreate: null,
  txCreateContract: null,
  txCreateChainId: null,
  contractAddress: null,
  chainId: null,
};

const historical = {
  ...draft,
  onchainId: "1",
  contractAddress: "0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d",
  chainId: 61999,
};

const legacy = {
  ...draft,
  onchainId: "10",
  contractAddress: "0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8D7C",
  chainId: 61999,
};

const active = {
  ...draft,
  onchainId: "1",
  contractAddress: "0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703",
  chainId: 61997,
};

test("new Guard creation binds 61997 + 0x4105", () => {
  const created = guardDeployment(draft);
  assert.equal(created.chainId, 61997);
  assert.equal(created.contractAddress, "0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703");
  assert.equal(getActiveDeployment().key, "studio-dev-v1");
});

test("historical 0xe39e Guard reads through 61999", () => {
  const resolved = getReadClientForProvenance({
    chainId: historical.chainId,
    contractAddress: historical.contractAddress,
  });
  assert.equal(resolved.chain.id, studionet.id);
  assert.equal(resolved.deployment.chainId, 61999);
  assert.equal(resolved.deployment.key, "studionet-v1");
});

test("legacy 0x9Fa3 Guard reads through 61999", () => {
  const resolved = getReadClientForProvenance({
    chainId: legacy.chainId,
    contractAddress: legacy.contractAddress,
  });
  assert.equal(resolved.chain.id, studionet.id);
  assert.equal(resolved.deployment.key, "studionet-legacy");
});

test("new 0x4105 Guard reads through 61997", () => {
  const resolved = getReadClientForProvenance({
    chainId: active.chainId,
    contractAddress: active.contractAddress,
  });
  assert.equal(resolved.chain.id, studioDevnet.id);
  assert.equal(resolved.deployment.chainId, 61997);
});

test("historical Guard mutation rejected as read-only", () => {
  try {
    requireActiveWrite(resolvedDeployment(historical));
    assert.fail("expected historical write to fail");
  } catch (error) {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, "HISTORICAL_DEPLOYMENT_READ_ONLY");
  }
  try {
    requireActiveWrite(resolvedDeployment(legacy));
    assert.fail("expected legacy write to fail");
  } catch (error) {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, "HISTORICAL_DEPLOYMENT_READ_ONLY");
  }
});

test("new active Guard mutation routing selects 61997", () => {
  const allowed = requireActiveWrite(resolvedDeployment(active));
  assert.equal(allowed.chainId, 61997);
  assert.equal(genLayerChainForDeployment(allowed).id, studioDevnet.id);
});

test("61999 tx reconciliation selects 61999 RPC", () => {
  const { chain, deployment } = getReadClientForProvenance({
    chainId: 61999,
    contractAddress: historical.contractAddress,
  });
  assert.equal(chain.id, 61999);
  assert.equal(chain.rpcUrls.default.http[0], "https://studio.genlayer.com/api");
  assert.notEqual(deployment.rpcUrl, getActiveDeployment().rpcUrl);
});

test("61997 tx reconciliation selects 61997 RPC", () => {
  const { chain } = getReadClientForProvenance({
    chainId: 61997,
    contractAddress: active.contractAddress,
  });
  assert.equal(chain.id, 61997);
  assert.equal(chain.rpcUrls.default.http[0], "https://studio-dev.genlayer.com/api");
});

test("unknown chain+contract fails closed", () => {
  assert.throws(
    () => getDeploymentByChainAndContract(61997, historical.contractAddress),
    /Unsupported/,
  );
  assert.throws(
    () => getReadClientForProvenance({ chainId: 1, contractAddress: active.contractAddress }),
    /Unsupported/,
  );
});

test("same tx hash on different chain is not treated as same identity", () => {
  const hash = `0x${"ab".repeat(32)}`;
  assert.notEqual(
    transactionIdentity({ chainId: 61999, contractAddress: historical.contractAddress, txHash: hash }),
    transactionIdentity({ chainId: 61997, contractAddress: active.contractAddress, txHash: hash }),
  );
});

test("receipt provenance is not replaced by active deployment", () => {
  const historicalReceipt = {
    contractAddress: guardDeployment(historical).contractAddress,
    chainId: guardDeployment(historical).chainId,
    network: guardDeployment(historical).network,
  };
  assert.equal(historicalReceipt.chainId, 61999);
  assert.notEqual(historicalReceipt.contractAddress, getActiveDeployment().contractAddress);
  assert.notEqual(historicalReceipt.network, getActiveDeployment().networkName);
});

test("existing historical Guard does not silently migrate", () => {
  const resolved = guardDeployment(historical);
  assert.equal(resolved.chainId, 61999);
  assert.equal(resolved.contractAddress.toLowerCase(), historical.contractAddress.toLowerCase());
});

test("null/partial historical provenance fails closed", () => {
  assert.throws(() => guardDeployment({ ...draft, onchainId: "1" }), /provenance is missing/);
  assert.throws(() => guardDeployment({ ...draft, txCreate: "0xabc", chainId: 61999 }), /provenance is missing/);
});

test("transaction finality is monotonic", () => {
  assert.equal(monotonicTransactionStatus("ACCEPTED", "PENDING"), "ACCEPTED");
  assert.equal(monotonicTransactionStatus("FINALIZED", "ACCEPTED"), "FINALIZED");
  assert.equal(monotonicTransactionStatus("PENDING", "FINALIZED"), "FINALIZED");
  assert.ok(transactionStatusRank("FINALIZED") > transactionStatusRank("ACCEPTED"));
});

test("SDK writes against a historical contract are blocked", async () => {
  const client = new MetricMotiveClient({
    contractAddress: historical.contractAddress as `0x${string}`,
    account: { address: "0x61e26394c57c540C152f45f373f6C03a38674E2d" } as never,
  });
  await assert.rejects(client.createGuard({ motive: "m", metric: "n", guardrails: [] }), /readable only|HISTORICAL_DEPLOYMENT_READ_ONLY/i);
});
