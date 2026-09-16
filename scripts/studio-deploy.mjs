#!/usr/bin/env node
/**
 * Deploy MetricMotive to GenLayer Studionet and verify every public read method.
 * Private keys stay in /tmp, never in the repository.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const SOURCE = "contracts/metric-motive/src/metric_motive.py";
const ACCOUNT_PATH = "/tmp/studio-account.json";
const OUT_PATH = "/tmp/studio-deploy.json";
const ZERO = "0x0000000000000000000000000000000000000000";

function loadAccount() {
  if (existsSync(ACCOUNT_PATH)) {
    const saved = JSON.parse(readFileSync(ACCOUNT_PATH, "utf8"));
    if (typeof saved.privateKey === "string" && saved.privateKey.startsWith("0x")) {
      return createAccount(saved.privateKey);
    }
  }
  const privateKey = generatePrivateKey();
  const next = createAccount(privateKey);
  writeFileSync(
    ACCOUNT_PATH,
    JSON.stringify({ address: next.address, privateKey }, null, 2),
  );
  return next;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function dump(value) {
  return JSON.stringify(
    value,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  );
}

function isRateLimit(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /rate limit/i.test(msg);
}

async function withRetry(fn, label, attempts = 10) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isRateLimit(err) || i === attempts - 1) throw err;
      const wait = 8000 + i * 4000;
      console.log(`rate-limited on ${label}, waiting ${wait}ms`);
      await sleep(wait);
    }
  }
  throw last;
}

function executionOf(receipt) {
  const leader = receipt?.consensus_data?.leader_receipt;
  const first = Array.isArray(leader) ? leader[0] : leader;
  return (
    first?.execution_result ??
    first?.genvm_result?.error_description ??
    receipt?.txExecutionResultName ??
    null
  );
}

function extractAddress(receipt) {
  const decoded = receipt?.txDataDecoded;
  if (decoded && typeof decoded === "object" && decoded.contractAddress) {
    return String(decoded.contractAddress);
  }
  const data = receipt?.data;
  if (data && typeof data === "object") {
    const fromData =
      data.contract_address || data.contractAddress || data.address;
    if (fromData) return String(fromData);
  }
  for (const key of ["recipient", "to_address", "to"]) {
    const value = receipt?.[key];
    if (typeof value === "string" && value.startsWith("0x") && value !== ZERO) {
      return value;
    }
  }
  return null;
}

const account = loadAccount();
const client = createClient({ chain: studionet, account });
const code = readFileSync(new URL(`../${SOURCE}`, import.meta.url), "utf8");

const out = {
  network: "studionet",
  chainId: 61999,
  rpcUrl: "https://studio.genlayer.com/api",
  studioUrl: "https://studio.genlayer.com/contracts",
  explorerUrl: "https://explorer-studio.genlayer.com",
  source: SOURCE,
  contractVersion: "1.0.0",
  deployer: account.address,
  startedAt: new Date().toISOString(),
  schema: null,
  deployTx: null,
  contractAddress: null,
  execution: null,
  validatorsAgreed: 0,
  reads: [],
  certified: false,
};

console.log("deployer", account.address);
console.log("source bytes", code.length);

try {
  out.schema = await withRetry(
    () => client.getContractSchemaForCode(code),
    "getContractSchemaForCode",
  );
  console.log("schema methods", Object.keys(out.schema?.methods ?? out.schema ?? {}));
} catch (err) {
  console.warn(
    "schema check skipped:",
    err instanceof Error ? err.message : String(err),
  );
}

console.log("deploying…");
const hash = await withRetry(
  () => client.deployContract({ code, args: [], leaderOnly: false }),
  "deployContract",
);
out.deployTx = hash;
console.log("deploy tx", hash);

const receipt = await client.waitForTransactionReceipt({
  hash,
  status: TransactionStatus.ACCEPTED,
  interval: 4000,
  retries: 180,
});

out.execution = executionOf(receipt);
out.validatorsAgreed = Array.isArray(receipt?.consensus_data?.validators)
  ? receipt.consensus_data.validators.length
  : Object.keys(receipt?.consensus_data?.votes ?? {}).length;
out.contractAddress = extractAddress(receipt);
out.receiptKeys = receipt ? Object.keys(receipt) : [];
writeFileSync("/tmp/studio-deploy-receipt.json", dump(receipt));
console.log("execution", out.execution);
console.log("address", out.contractAddress);
console.log("validators", out.validatorsAgreed);

if (!out.contractAddress) {
  out.error = "Could not extract contract address from receipt";
  writeFileSync(OUT_PATH, dump(out));
  console.error(out.error);
  process.exit(1);
}

const execOk = String(out.execution ?? "").toUpperCase() === "SUCCESS";
if (!execOk && out.execution) {
  console.warn("execution was not SUCCESS; continuing with reads to inspect state");
}

async function read(functionName, args = []) {
  const started = Date.now();
  try {
    const result = await withRetry(
      () =>
        client.readContract({
          address: out.contractAddress,
          functionName,
          args,
        }),
      functionName,
    );
    return { ok: true, functionName, args, ms: Date.now() - started, result };
  } catch (err) {
    return {
      ok: false,
      functionName,
      args,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const cases = [
  ["get_contract_info", []],
  ["get_guard_count", []],
  ["get_guard_summary", [0]],
  ["get_guard_summary", [1]],
  ["get_guard_status", [0]],
  ["get_guard_status", [1]],
  ["get_guard_definition", [0]],
  ["get_guard_definition", [1]],
  ["get_guard_lineage", [0]],
  ["get_guard_lineage", [1]],
  ["get_guard_evidence", [0]],
  ["get_guard_evidence", [1]],
  ["get_guard_findings", [0]],
  ["get_guard_findings", [1]],
  ["get_guard_verdict", [0]],
  ["get_guard_verdict", [1]],
  ["get_guard", [0]],
  ["get_guard", [1]],
  ["get_guard", [999]],
  ["get_guards_by_owner", [account.address]],
  ["get_guards_by_owner", ["not-an-address"]],
];

for (const [name, args] of cases) {
  const row = await read(name, args);
  out.reads.push(row);
  console.log(
    `${row.ok ? "PASS" : "FAIL"} ${name} ${JSON.stringify(args)} ${row.ok ? "" : row.error}`,
  );
  if (row.ok) console.log(dump(row.result).slice(0, 800));
  await sleep(350);
}

const methods = [
  "get_contract_info",
  "get_guard_count",
  "get_guard_summary",
  "get_guard_status",
  "get_guard_definition",
  "get_guard_lineage",
  "get_guard_evidence",
  "get_guard_findings",
  "get_guard_verdict",
  "get_guard",
  "get_guards_by_owner",
];
out.readMethods = methods;
out.writeMethods = [
  "create_guard",
  "update_draft",
  "arm_guard",
  "submit_evidence",
  "evaluate_guard",
  "create_version",
];
out.readPass = out.reads.every((r) => r.ok);
out.methodsCovered = methods.every((m) =>
  out.reads.some((r) => r.functionName === m && r.ok),
);
out.certified = Boolean(out.readPass && out.methodsCovered && out.contractAddress);
out.certifiedAt = new Date().toISOString();
out.finishedAt = out.certifiedAt;
writeFileSync(OUT_PATH, dump(out));
console.log("\nSUMMARY readPass", out.readPass, "methodsCovered", out.methodsCovered);
console.log("wrote", OUT_PATH);
if (!out.readPass || !out.methodsCovered) process.exit(1);
