import assert from "node:assert/strict";
import test from "node:test";
import {
  DEPLOYMENTS,
  CURRENT_CONTRACT,
  getActiveDeployment,
  getDeploymentByKey,
  getDeploymentByChainAndContract,
  getDeploymentForChain,
} from "../src/deployment.ts";
import { guardDeployment } from "../../../src/lib/contract.ts";

const draft = {
  onchainId: null,
  txCreate: null,
  txCreateContract: null,
  txCreateChainId: null,
  contractAddress: null,
  chainId: null,
};

test("exactly one active deployment exists and it is studio-dev-v1", () => {
  const actives = Object.values(DEPLOYMENTS).filter((row) => row.status === "active");
  assert.equal(actives.length, 1);
  const active = getActiveDeployment();
  assert.equal(active.key, "studio-dev-v1");
  assert.equal(active.chainId, 61997);
  assert.equal(active.contractAddress, "0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703");
  assert.equal(active.rpcUrl, "https://studio-dev.genlayer.com/api");
  assert.equal(active.explorerUrl, "https://explorer-studio-dev.genlayer.com");
  assert.equal(CURRENT_CONTRACT.chainId, 61997);
  assert.equal(CURRENT_CONTRACT.contractAddress, active.contractAddress);
});

test("lookup by key returns the registered rows", () => {
  assert.equal(getDeploymentByKey("studionet-v1").contractAddress, "0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d");
  assert.equal(getDeploymentByKey("studionet-legacy").contractAddress, "0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8D7C");
  assert.throws(() => getDeploymentByKey("missing"), /Unknown deployment key/);
});

test("61999 deployments are distinguished by contract address", () => {
  const previous = getDeploymentByChainAndContract(61999, "0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d");
  const older = getDeploymentByChainAndContract(61999, "0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8D7C");
  assert.equal(previous.key, "studionet-v1");
  assert.equal(older.key, "studionet-legacy");
  assert.notEqual(previous.contractAddress.toLowerCase(), older.contractAddress.toLowerCase());
  assert.throws(() => getDeploymentForChain(61999), /not sufficient/);
  assert.equal(getDeploymentForChain(61997).key, "studio-dev-v1");
});

test("unknown chain/contract pair fails closed", () => {
  assert.throws(
    () => getDeploymentByChainAndContract(61997, "0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d"),
    /Unsupported/,
  );
  assert.throws(
    () => getDeploymentByChainAndContract(1, "0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703"),
    /Unsupported/,
  );
});

test("persisted 61999 Guard does not resolve to active 61997", () => {
  const historical = guardDeployment({
    ...draft,
    onchainId: "1",
    contractAddress: "0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d",
    chainId: 61999,
  });
  assert.equal(historical.chainId, 61999);
  assert.equal(historical.contractAddress, "0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d");
  assert.notEqual(historical.chainId, getActiveDeployment().chainId);

  const legacy = guardDeployment({
    ...draft,
    onchainId: "10",
    contractAddress: "0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8D7C",
    chainId: 61999,
  });
  assert.equal(legacy.contractAddress, "0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8D7C");
});

test("persisted 61997 Guard resolves active", () => {
  const row = guardDeployment({
    ...draft,
    onchainId: "1",
    contractAddress: "0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703",
    chainId: 61997,
  });
  assert.equal(row.chainId, 61997);
  assert.equal(row.contractAddress, getActiveDeployment().contractAddress);
});

test("new drafts may use active; null provenance on bound records fails closed", () => {
  assert.equal(guardDeployment(draft).contractAddress, getActiveDeployment().contractAddress);
  assert.throws(
    () => guardDeployment({ ...draft, onchainId: "10" }),
    /provenance is missing/,
  );
  assert.throws(
    () => guardDeployment({ ...draft, txCreate: "0xabc", chainId: 61999 }),
    /provenance is missing/,
  );
  assert.throws(
    () =>
      guardDeployment({
        ...draft,
        onchainId: "1",
        chainId: 61999,
        contractAddress: "0x0000000000000000000000000000000000000001",
      }),
    /Unsupported/,
  );
});
