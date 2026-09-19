import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { studioDevnet } from "genlayer-js/chains";
import { getActiveDeployment } from "./contract.ts";
import { studioDevChain, ACTIVE_CHAIN_ID } from "./wallet/chain.ts";
import { explorerTxUrl, explorerAddressUrl, contractProvenanceLabel, preservePersistedVerdict } from "./explorer.ts";
import { txLabel, type TxState } from "./wallet/tx-state.ts";
import { DEPLOYMENT_FACTS } from "./docs-content.ts";

const ACTIVE = "0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703";
const HISTORICAL = "0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d";
const LEGACY = "0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8D7C";
const HASH = `0x${"ab".repeat(32)}`;

test("active wallet chain is Studio Dev 61997 via studioDevnet", () => {
  assert.equal(ACTIVE_CHAIN_ID, 61997);
  assert.equal(studioDevnet.id, 61997);
  assert.equal(studioDevChain.id, studioDevnet.id);
  assert.equal(studioDevChain.name, "GenLayer Studio Dev");
  assert.equal(studioDevChain.rpcUrls.default.http[0], "https://studio-dev.genlayer.com/api");
  assert.equal(getActiveDeployment().contractAddress, ACTIVE);
});

test("wrong-network copy and switch target are Studio Dev 61997", () => {
  const state: TxState = { phase: "wrong-network", action: "create_guard", hash: null, error: null };
  assert.equal(txLabel(state), "Switch to GenLayer Studio Dev");
  const write = readFileSync("src/lib/wallet/write.ts", "utf8");
  assert.match(write, /studioDevnet/);
  assert.match(write, /Switch to GenLayer Studio Dev/);
  assert.match(write, /eth_chainId/);
});

test("explorer routing is provenance-aware", () => {
  assert.equal(
    explorerTxUrl(HASH, { chainId: 61997, contractAddress: ACTIVE }),
    `https://explorer-studio-dev.genlayer.com/tx/${HASH}`,
  );
  assert.equal(
    explorerTxUrl(HASH, { chainId: 61999, contractAddress: HISTORICAL }),
    `https://explorer-studio.genlayer.com/tx/${HASH}`,
  );
  assert.equal(
    explorerTxUrl(HASH, { chainId: 61999, contractAddress: LEGACY }),
    `https://explorer-studio.genlayer.com/tx/${HASH}`,
  );
  assert.equal(explorerTxUrl(HASH, { chainId: 1, contractAddress: ACTIVE }), null);
  assert.equal(explorerAddressUrl("not-an-address"), null);
});

test("provenance labels distinguish active, historical, and legacy", () => {
  assert.equal(contractProvenanceLabel(ACTIVE), "active");
  assert.equal(contractProvenanceLabel(HISTORICAL), "historical");
  assert.equal(contractProvenanceLabel(LEGACY), "legacy");
  assert.equal(contractProvenanceLabel("0x0000000000000000000000000000000000000001"), "unknown");
});

test("historical live RPC failure does not erase a persisted verdict", () => {
  const persisted = { verdict: "PARTIAL_ALIGNMENT", status: "RESOLVED" };
  const next = preservePersistedVerdict(persisted, new Error("Historical network currently unavailable"));
  assert.equal(next.verdict, "PARTIAL_ALIGNMENT");
  assert.equal(next.status, "RESOLVED");
  assert.equal(next.liveNetworkUnavailable, true);
});

test("active UI copy is Studio Dev / 61997", () => {
  assert.equal(DEPLOYMENT_FACTS.network, "GenLayer Studio Dev");
  assert.equal(DEPLOYMENT_FACTS.chainId, 61997);
  assert.equal(DEPLOYMENT_FACTS.contract, ACTIVE);
  const docs = readFileSync("src/lib/docs-content.ts", "utf8");
  assert.match(docs, /Studio development network, not a mainnet/);
});

test("historical Guard write CTAs are disabled in chain-actions", () => {
  const source = readFileSync("src/components/chain-actions.tsx", "utf8");
  assert.match(source, /Historical deployment — read only/);
  assert.match(source, /useHistoricalReadOnly/);
  assert.match(source, /ACTIVE_CHAIN_ID/);
});

test("CSP allows Studio Dev origins without new wildcards", () => {
  const prod = readFileSync("server/middleware/security-headers.ts", "utf8");
  const http = readFileSync("src/lib/server/http-guard.ts", "utf8");
  for (const source of [prod, http]) {
    assert.match(source, /https:\/\/studio-dev\.genlayer\.com/);
    assert.match(source, /https:\/\/explorer-studio-dev\.genlayer\.com/);
    assert.doesNotMatch(source, /https:\/\/\*\.genlayer\.com/);
  }
});
