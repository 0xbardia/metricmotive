import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

// Synthetic values only. The gate reads the environment and the registry, never a real .env.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GATE = join(ROOT, "scripts", "check-deployment.mjs");
const dir = mkdtempSync(join(tmpdir(), "check-deployment-"));
after(() => rmSync(dir, { recursive: true, force: true }));

// Active row: studio-dev-v1 (packages/sdk/src/deployment.ts).
const ACTIVE = {
  GENLAYER_CONTRACT_ADDRESS: "0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703",
  GENLAYER_CHAIN_ID: "61997",
  GENLAYER_NETWORK: "GenLayer Studio Dev",
  GENLAYER_RPC_URL: "https://studio-dev.genlayer.com/api",
};
// Historical row: studionet-v1. Registered, not active.
const OLD = {
  GENLAYER_CONTRACT_ADDRESS: "0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d",
  GENLAYER_CHAIN_ID: "61999",
  GENLAYER_NETWORK: "Studionet",
  GENLAYER_RPC_URL: "https://studio.genlayer.com/api",
};

// Only PATH is inherited, so a developer's own GENLAYER_* exports cannot change a case.
const run = (args, env = {}) => spawnSync(args[0], args.slice(1), { cwd: ROOT, env: { PATH: process.env.PATH, ...env }, encoding: "utf8" });
const gate = (env) => run([process.execPath, GATE], env);
const quoteNetwork = (vars) => ({ ...vars, GENLAYER_NETWORK: `"${vars.GENLAYER_NETWORK}"` });
const envFile = (name, vars) => {
  const file = join(dir, name);
  writeFileSync(file, Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  return file;
};
// Same order as deployment/start-production.sh (set -eu; set -a; . .env; set +a; node gate), minus the final exec.
const startOrder = (file) => run(["/bin/sh", "-c", 'set -eu; set -a; . "$1"; set +a; exec "$2" "$3"', "sh", file, process.execPath, GATE]);

test("aligned values pass and the log names the active deployment", () => {
  const r = gate(ACTIVE);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /verified: 0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703 \/ 61997/);
});

test("historical Studionet pair is refused, and the error names the active deployment", () => {
  const r = gate(OLD);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not the active deployment \(studio-dev-v1: chain 61997/);
});

test("unset variables fall back to the registry", () => {
  const r = gate({});
  assert.equal(r.status, 0, r.stderr);
});

test("mixed pairs are refused in both directions", () => {
  assert.equal(gate({ ...ACTIVE, GENLAYER_CHAIN_ID: "61999" }).status, 1);
  assert.equal(gate({ ...ACTIVE, GENLAYER_CONTRACT_ADDRESS: OLD.GENLAYER_CONTRACT_ADDRESS }).status, 1);
});

test("network and RPC must match the active row", () => {
  assert.match(gate({ ...ACTIVE, GENLAYER_NETWORK: "Studionet" }).stderr, /GENLAYER_NETWORK disagrees/);
  assert.match(gate({ ...ACTIVE, GENLAYER_RPC_URL: "https://studio.genlayer.com" }).stderr, /GENLAYER_RPC_URL disagrees/);
});

test("a literal quote character inside the network value is refused, not trimmed", () => {
  const r = gate({ ...ACTIVE, GENLAYER_NETWORK: '"GenLayer Studio Dev"' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /GENLAYER_NETWORK disagrees/);
});

test("start order: quoted network in .env passes the gate", () => {
  const r = startOrder(envFile("quoted.env", quoteNetwork(ACTIVE)));
  assert.equal(r.status, 0, r.stderr);
});

test("start order: unquoted network with spaces stops sh before the gate", () => {
  const r = startOrder(envFile("unquoted.env", ACTIVE));
  assert.equal(r.status, 127);
  assert.match(r.stderr, /not found/);
});

test("start order: the stale .env is refused by the gate", () => {
  const r = startOrder(envFile("stale.env", OLD));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not the active deployment/);
});

test("build order: node --env-file accepts quoted and unquoted network alike", () => {
  for (const [name, vars] of [["quoted", quoteNetwork(ACTIVE)], ["unquoted", ACTIVE]]) {
    const r = run([process.execPath, `--env-file=${envFile(`build-${name}.env`, vars)}`, GATE]);
    assert.equal(r.status, 0, `${name}: ${r.stderr}`);
  }
});
