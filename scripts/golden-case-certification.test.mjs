import assert from "node:assert/strict";
import { test, describe, after } from "node:test";
import pg from "pg";

/**
 * Read-only certification of the finalized golden case (Guard #1).
 *
 * There is no wallet, signer, or contract write anywhere in this file: every
 * statement is a SELECT over the local projection. It exists so the mission's
 * pinned case cannot silently drift — if the Guard, its Run, its three chain
 * transactions or its verdict change, this fails.
 *
 * Without DATABASE_URL the suite skips and says so loudly rather than passing
 * quietly, so "green" never means "never checked".
 */
const GOLDEN = {
  guardId: "grd_6d6278eb29c57b18",
  onchainId: "1",
  runId: "run_23d38577bc28cf7e",
  events: 5,
  lockTx: "0x0560fc9ca162fb3e61cf84c03aee79989335ea84ec773d4926bcaff494737e0a",
  evidenceTx: "0xfbdef2727d475c9da6e471869e872c0fe346e8bf93a25a640235b2e559d54e87",
  evaluateTx: "0x5f20d57fbc452a24f7c6f3373606651223fd1e9a693f1bea655e9557af2aefee",
  verdict: "PARTIAL_ALIGNMENT",
  primaryPattern: "DECEPTIVE_COMPLETION",
  receiptId: "rct_bf3bc92aba3e2d26",
  contract: "0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d",
};

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const pool = hasDatabase ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 }) : null;

describe("golden case is preserved end to end", { skip: hasDatabase ? false : "DATABASE_URL not set" }, () => {
  after(async () => {
    await pool?.end();
  });

  test("the Guard still holds its finalized identity and all three transactions", async () => {
    const { rows } = await pool.query(
      `select id, status, onchain_id, verdict, primary_pattern, tx_arm, tx_evidence, tx_evaluate,
              evidence_hash, contract_address
         from guards where id = $1`,
      [GOLDEN.guardId],
    );
    assert.equal(rows.length, 1, "exactly one local Guard row for the golden case");
    const guard = rows[0];
    assert.equal(guard.status, "RESOLVED");
    assert.equal(guard.onchain_id, GOLDEN.onchainId);
    assert.equal(guard.verdict, GOLDEN.verdict);
    assert.equal(guard.primary_pattern, GOLDEN.primaryPattern);
    assert.equal(guard.tx_arm, GOLDEN.lockTx);
    assert.equal(guard.tx_evidence, GOLDEN.evidenceTx);
    assert.equal(guard.tx_evaluate, GOLDEN.evaluateTx);
    assert.equal(guard.contract_address, GOLDEN.contract);
    assert.match(guard.evidence_hash, /^[0-9a-f]{64}$/);
  });

  test("the Run is still FINISHED with exactly five committed events", async () => {
    const { rows } = await pool.query(
      `select id, guard_id, status, coalesce(jsonb_array_length(events_json::jsonb), 0) as events
         from runs where guard_id = $1`,
      [GOLDEN.guardId],
    );
    assert.equal(rows.length, 1, "the resolved Guard must expose exactly its one existing Run");
    assert.equal(rows[0].id, GOLDEN.runId);
    assert.equal(rows[0].status, "FINISHED");
    assert.equal(rows[0].events, GOLDEN.events);
  });

  test("the Run snapshot is immutable and already committed", async () => {
    const { rows } = await pool.query(
      `select evidence_snapshot_json, evidence_manifest_hash, evidence_commitment_hash, evidence_committed_at
         from runs where id = $1`,
      [GOLDEN.runId],
    );
    const run = rows[0];
    assert.ok(run.evidence_snapshot_json, "a finished Run must persist its exact snapshot");
    assert.match(run.evidence_manifest_hash, /^[0-9a-f]{64}$/);
    assert.match(run.evidence_commitment_hash, /^[0-9a-f]{64}$/);
    assert.ok(run.evidence_committed_at, "the commitment must be dated");
    const snapshot = JSON.parse(run.evidence_snapshot_json);
    assert.equal(Array.isArray(snapshot.events) ? snapshot.events.length : null, GOLDEN.events);
  });

  test("three write transactions are recorded and none were replayed", async () => {
    const { rows } = await pool.query(
      `select operation, count(*)::int as n from guard_transactions
        where guard_id = $1 and operation in ('arm_guard','submit_evidence','evaluate_guard')
        group by operation`,
      [GOLDEN.guardId],
    );
    const byOperation = Object.fromEntries(rows.map((row) => [row.operation, row.n]));
    assert.equal(byOperation.arm_guard, 1);
    assert.equal(byOperation.submit_evidence, 1);
    assert.equal(byOperation.evaluate_guard, 1);
  });

  test("the public receipt still carries the finalized verdict", async () => {
    const { rows } = await pool.query(`select id, snapshot_json from receipts where guard_id = $1`, [
      GOLDEN.guardId,
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, GOLDEN.receiptId);
    const raw = rows[0].snapshot_json;
    const snapshot = typeof raw === "string" ? JSON.parse(raw) : raw;
    assert.equal(snapshot.verdict, GOLDEN.verdict);
    assert.equal(snapshot.primaryPattern, GOLDEN.primaryPattern);
    assert.equal(snapshot.txEvidence, GOLDEN.evidenceTx);
    assert.equal(snapshot.txEvaluate, GOLDEN.evaluateTx);
  });

  test("the case was not duplicated by this pass", async () => {
    const { rows } = await pool.query(
      `select count(*)::int as n from guards where id = $1 or onchain_id = $2`,
      [GOLDEN.guardId, GOLDEN.onchainId],
    );
    assert.equal(rows[0].n, 1, "exactly one Guard holds on-chain id 1");
  });
});
