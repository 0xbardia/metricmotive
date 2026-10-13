import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { checkStep } from "./check-cutover-output.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const CONTRACT = "0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703";
const check = (s, t) => checkStep(s, t);
const fails = (s, t, re) => { const r = check(s, t); assert.equal(r.ok, false, `expected FAIL for step ${s}`); assert.match(r.aborts.join("\n"), re); };

// Real output of scripts/compare-env-registry.mjs with GENLAYER_* set in-process.
function compare(env) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GENLAYER_")));
  return spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "scripts/compare-env-registry.mjs"], { cwd: ROOT, env: { ...clean, ...env }, encoding: "utf8" }).stdout;
}
const MATCH = { GENLAYER_CONTRACT_ADDRESS: CONTRACT.toLowerCase(), GENLAYER_CHAIN_ID: "61997", GENLAYER_NETWORK: "GenLayer Studio Dev", GENLAYER_RPC_URL: "https://studio-dev.genlayer.com/api" };

test("p1", () => {
  const ok = compare(MATCH);
  assert.match(ok, /GENLAYER_CHAIN_ID: match/);
  assert.equal(check("p1", ok).ok, true);
  fails("p1", compare({ ...MATCH, GENLAYER_CHAIN_ID: "1" }), /GENLAYER_CHAIN_ID MISMATCH/);
  fails("p1", compare({ ...MATCH, GENLAYER_RPC_URL: undefined }), /NOT PASS: unset variable falls back to the registry value, needs explicit human OK/);
  fails("p1", ok.split("\n").filter((l) => !l.startsWith("GENLAYER_NETWORK")).join("\n"), /GENLAYER_NETWORK line missing/);
  fails("p1", ok.replace("studio-dev-v1", "other"), /registry active deployment/);
});

const S1 = `added 894 packages in 60s
[migrate] DATABASE_URL not set — skipping (the PGLite fallback migrates itself).
[seed] DATABASE_URL not set — skipping official examples.
pglite.data
pglite.wasm
`;
test("1", () => {
  const r = check("1", S1);
  assert.equal(r.ok, true);
  assert.match(r.notes[0], /894/);
  assert.equal(check("1", S1.replace("894", "900")).ok, true);
  fails("1", S1.replace("pglite.wasm\n", ""), /pglite.wasm not listed/);
  fails("1", S1.replace(/\[seed\].*\n/, ""), /seed/);
  fails("1", S1.replace(/\[migrate\].*\n/, ""), /migrate/);
  fails("1", "npm ERR! boom\n" + S1, /error/);
});

const HASH = "c2ffa2e" + "0123456789abcdef0123456789abcdef0".slice(0, 33);
test("2", () => {
  assert.equal(check("2", `11\n${HASH}\n`).ok, true);
  assert.equal(check("2", `14\n${HASH}\n`).ok, true);
  fails("2", `pg_dump: warning: server version mismatch\n11\n${HASH}\n`, /not silent/);
  fails("2", `10\n${HASH}\n`, /below 11/);
  fails("2", `11\nabc1234${HASH.slice(7)}\n`, /c2ffa2e/);
  fails("2", `11\nc2ffa2e\n`, /40-hex/);
});

const S3 = `[migrate] applied 0011_failed_tx_supersede.sql
[migrate] applied 0012_tx_run_id.sql
[migrate] applied 0013_chain_resolved_at.sql
[migrate] done — 3 migration(s) applied.
`;
test("3", () => {
  assert.equal(check("3", S3).ok, true);
  assert.equal(check("3", S3.replace("—", "-")).ok, true);
  fails("3", "[migrate] up to date.\n", /already migrated/);
  fails("3", S3.replace(/\[migrate\] applied 0012.*\n/, "").replace("3 migration", "2 migration"), /applied list/);
  fails("3", S3.replace("0012_tx_run_id", "0012_other"), /applied list/);
  fails("3", S3 + "[migrate] failed: boom\n", /error/);
});

const S4 = `0013_chain_resolved_at.sql
0012_tx_run_id.sql
0011_failed_tx_supersede.sql
0010_run_evidence_snapshot.sql
create_guard_intents.failed_at
create_guard_intents.failure_kind
create_guard_intents.failure_reason
guard_transactions.failed_at
guard_transactions.failure_kind
guard_transactions.failure_reason
guard_transactions.run_id
guards.chain_resolved_at
t|t
0
0
0
0
`;
test("4", () => {
  assert.equal(check("4", S4).ok, true);
  fails("4", S4.replace("t|t", "t|f"), /line 13/);
  fails("4", S4.trimEnd().replace(/0$/, "1") + "\n", /line 17/);
  fails("4", S4.replace("guards.chain_resolved_at\n", ""), /line 12/);
  fails("4", S4 + "0\n", /18 lines/);
});

const READY = (o = {}) => JSON.stringify({ status: "ready", db: true, contractConfigured: true, chainId: 61997, network: "GenLayer Studio Dev", contractAddress: CONTRACT, ...o });
const PM2 = "│ 0  │ metricmotive-web │ default │ online │ 2 │\n";
test("5", () => {
  assert.equal(check("5", READY() + "\n" + PM2).ok, true);
  assert.equal(check("5", READY({ contractAddress: CONTRACT.toLowerCase() })).ok, true);
  fails("5", READY({ db: false }), /db is false/);
  fails("5", READY({ chainId: 1 }), /chainId/);
  fails("5", READY({ contractAddress: "0x0000000000000000000000000000000000000001" }), /contractAddress/);
  fails("5", READY({ status: "starting" }), /status/);
  fails("5", READY() + "\n" + PM2.replace("online", "errored"), /pm2/);
  fails("5", "502 Bad Gateway", /ready JSON missing/);
});
test("6", () => {
  assert.equal(check("6", READY()).ok, true);
  fails("6", READY({ chainId: 5 }), /chainId/);
  fails("6", READY({ contractAddress: "0xabc" }), /contractAddress/);
});

const S7 = "BEGIN\nALTER TABLE\nALTER TABLE\nDROP TABLE\nDROP INDEX\nDROP TABLE\nALTER TABLE\nDELETE 3\nCOMMIT\n";
test("7", () => {
  assert.equal(check("7", S7).ok, true);
  fails("7", S7.replace("DELETE 3", "DELETE 2"), /DELETE 3/);
  fails("7", S7.replace("COMMIT\n", "ROLLBACK\n"), /COMMIT/);
  fails("7", S7.replace("DROP TABLE", "ERROR:  boom"), /ERROR/);
  fails("7", "BEGIN\nDELETE 3\nCOMMIT\n", /no ALTER/);
  assert.match(check("4", "x").rollback, /section 7/);
  assert.match(check("5", "x").rollback, /section 6/);
});
