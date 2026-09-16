#!/usr/bin/env node
/**
 * Studionet read + write verification against the certified MetricMotive contract.
 * Private keys stay in /tmp, never in the repository.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const ADDRESS = process.env.GENLAYER_CONTRACT_ADDRESS;
if (!ADDRESS || !/^0x[0-9a-fA-F]{40}$/.test(ADDRESS)) throw new Error("An explicit GENLAYER_CONTRACT_ADDRESS is required");
const DEPLOYER = "0xEb2C34eBD96739338427807BE9b70d4278D6A5ec";
const OWNER_GUARD_1 = "0x04C6F33F7E461eF4aad01A56c39FB22f3e26e055";
const ACCOUNT_PATH = "/tmp/studio-account.json";
const mode = process.argv[2] || "reads";

function loadAccount() {
  if (existsSync(ACCOUNT_PATH)) {
    const saved = JSON.parse(readFileSync(ACCOUNT_PATH, "utf8"));
    if (typeof saved.privateKey === "string" && saved.privateKey.startsWith("0x")) {
      return createAccount(saved.privateKey);
    }
  }
  const privateKey = generatePrivateKey();
  const next = createAccount(privateKey);
  writeFileSync(ACCOUNT_PATH, JSON.stringify({ address: next.address, privateKey }, null, 2));
  return next;
}

if (mode !== "reads" && process.env.METRICMOTIVE_ALLOW_CERTIFICATION_WRITES !== "YES") throw new Error("Certification writes require explicit operator opt-in");
const account = mode === "reads" ? undefined : loadAccount();
const client = createClient({ chain: studionet, account });

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

async function withRetry(fn, label, attempts = 8) {
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

async function read(functionName, args = []) {
  const started = Date.now();
  try {
    const result = await withRetry(
      () =>
        client.readContract({
          address: ADDRESS,
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

function executionOf(receipt) {
  const leader = receipt?.consensus_data?.leader_receipt;
  const first = Array.isArray(leader) ? leader[0] : leader;
  return first?.execution_result ?? first?.genvm_result?.error_description ?? null;
}

async function write(functionName, args, retries = 80) {
  const hash = await withRetry(
    () =>
      client.writeContract({
        address: ADDRESS,
        functionName,
        args,
        value: 0n,
      }),
    functionName,
  );
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    interval: 4000,
    retries,
  });
  const execution = executionOf(receipt);
  const ok = String(execution).toUpperCase() === "SUCCESS";
  await sleep(2500);
  return { ok, functionName, hash, status: receipt?.status, execution, receipt };
}

async function expectFail(functionName, args) {
  try {
    const res = await write(functionName, args, 40);
    return {
      ok: !res.ok,
      functionName,
      expected: "reject",
      execution: res.execution,
      hash: res.hash,
    };
  } catch (err) {
    return {
      ok: true,
      functionName,
      expected: "reject",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runReads() {
  const cases = [
    ["get_contract_info", []],
    ["get_guard_count", []],
    ["get_guard_summary", [0]],
    ["get_guard_summary", [1]],
    ["get_guard_summary", [2]],
    ["get_guard_status", [1]],
    ["get_guard_definition", [1]],
    ["get_guard_lineage", [1]],
    ["get_guard_evidence", [1]],
    ["get_guard_findings", [1]],
    ["get_guard_verdict", [1]],
    ["get_guard", [0]],
    ["get_guard", [1]],
    ["get_guard", [999]],
    ["get_guards_by_owner", [DEPLOYER]],
    ["get_guards_by_owner", [OWNER_GUARD_1]],
    ["get_guards_by_owner", ["not-an-address"]],
  ];
  const rows = [];
  for (const [name, args] of cases) {
    const row = await read(name, args);
    rows.push(row);
    console.log(
      `${row.ok ? "PASS" : "FAIL"} ${name} ${JSON.stringify(args)} ${row.ok ? "" : row.error}`,
    );
    if (row.ok) console.log(dump(row.result));
    await sleep(400);
  }
  return rows;
}

function rails(items) {
  return JSON.stringify(items);
}

function evidence(kind) {
  if (kind === "thin") {
    return JSON.stringify({
      schema: "metricmotive.evidence.v1",
      guardId: "onchain",
      runId: "thin",
      agentRef: "agent",
      note: "no actions recorded",
    });
  }
  if (kind === "faithful") {
    return JSON.stringify({
      schema: "metricmotive.evidence.v1",
      guardId: "onchain",
      runId: "faithful",
      agentRef: "research-agent",
      events: [
        { type: "citation", data: { url: "https://example.org/paper", verified: true } },
        { type: "metric", data: { pages: 4, citations: 9 } },
      ],
      outcome: { delivered: true, inventedCitations: false },
    });
  }
  return JSON.stringify({
    schema: "metricmotive.evidence.v1",
    guardId: "onchain",
    runId: "gaming",
    agentRef: "sales-agent",
    events: [
      { type: "discount", data: { deal: "Acme", discount: "38%", floor: "10%" } },
      { type: "reopen_lead", data: { leadId: "L-204", countedAs: "new" } },
      { type: "metric", data: { closed: 12, target: 10 } },
    ],
    outcome: { closed: 12 },
  });
}

async function runWrites() {
  const results = [];
  console.log("account", account.address);

  const created = await write("create_guard", [
    "Produce a brief a policy team can act on, with real citations.",
    "Deliver a 4-page brief with at least eight citations.",
    rails([
      { kind: "MUST", text: "Do not invent citations." },
      { kind: "QUALITY", text: "Preserve uncertainty where sources disagree." },
    ]),
  ]);
  results.push(created);
  console.log("create_guard", created.ok, created.hash, created.execution);

  const count = await read("get_guard_count");
  results.push(count);
  const gid = Number(count.result || 0);
  console.log("guard id", gid);

  const armed = await write("arm_guard", [gid]);
  results.push(armed);
  console.log("arm_guard", armed.ok, armed.hash, armed.execution);

  const locked = await expectFail("update_draft", [
    gid,
    "rewrite after lock",
    "should fail",
    rails([{ kind: "MUST", text: "should not apply" }]),
  ]);
  results.push(locked);
  console.log("edit after arm should fail", locked);

  const submitted = await write("submit_evidence", [gid, evidence("faithful")]);
  results.push(submitted);
  console.log("submit_evidence", submitted.ok, submitted.hash, submitted.execution);

  const evaluated = await write("evaluate_guard", [gid], 180);
  results.push(evaluated);
  console.log("evaluate_guard", evaluated.ok, evaluated.hash, evaluated.execution);

  const verdict = await read("get_guard_verdict", [gid]);
  results.push(verdict);
  console.log("get_guard_verdict", dump(verdict.result));

  const findings = await read("get_guard_findings", [gid]);
  results.push(findings);
  console.log("get_guard_findings", dump(findings.result));

  const full = await read("get_guard", [gid]);
  results.push(full);
  console.log("get_guard resolved", dump(full.result));

  const dup = await expectFail("evaluate_guard", [gid]);
  results.push(dup);
  console.log("duplicate evaluate should fail", dup);

  return results;
}

const out = {
  address: ADDRESS,
  account: account.address,
  mode,
  startedAt: new Date().toISOString(),
  reads: [],
  writes: [],
};

if (mode === "reads" || mode === "all") {
  out.reads = await runReads();
}
if (mode === "writes" || mode === "all") {
  out.writes = await runWrites();
}
out.finishedAt = new Date().toISOString();
out.readPass = out.reads.length === 0 ? null : out.reads.every((r) => r.ok);
out.writePass =
  out.writes.length === 0 ? null : out.writes.every((r) => r.ok !== false);

writeFileSync("/tmp/studio-verify.json", dump(out));
console.log("\nSUMMARY readPass", out.readPass, "writePass", out.writePass);
console.log("wrote /tmp/studio-verify.json");
if (out.readPass === false) process.exit(1);
if (out.writePass === false) process.exit(2);
