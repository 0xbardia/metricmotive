import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  MISMATCH_RECOVERY_MESSAGE,
  RESERVATION_TTL_MS,
  markTransactionFailed,
  releaseOperationSlot,
  replacementDecision,
  reserveOperationSlot,
  reservedByOther,
  supersedeFailedTransaction,
  type SqlLike,
} from "./operation-store.ts";

const OLD = "0x" + "a".repeat(64);
const NEW = "0x" + "b".repeat(64);
let pg: PGlite;
let sql: SqlLike;

before(async () => {
  pg = new PGlite();
  await pg.waitReady;
  const dir = new URL("../../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(new URL(file, dir), "utf8"));
  }
  sql = { query: async (text, params) => (await pg.query(text, params as never[])).rows as never };
});

async function seed(id: string, operation = "arm_guard", hash = OLD) {
  await pg.query(`insert into guards (id, owner_address, onchain_id, tx_arm) values ($1,'0xowner','7',$2)`, [id, hash]);
  await pg.query(
    `insert into guard_transactions (guard_id, operation, tx_hash, originating_wallet, chain_id, contract_address)
     values ($1,$2,$3,'0xowner',61997,'0xc')`,
    [id, operation, hash],
  );
}

const known = (over: Partial<Parameters<typeof replacementDecision>[0] & object> = {}) => ({
  txHash: OLD, reconciledAt: null, failureKind: null, ...over,
}) as Parameters<typeof replacementDecision>[0];

describe("replacement decision", () => {
  it("pending -> no replacement", () => {
    const d = replacementDecision(known(), NEW);
    assert.equal(d.action, "blocked");
    assert.match((d as { message: string }).message, /still confirming/);
  });
  it("mismatch -> blocked with the single recovery message", () => {
    const d = replacementDecision(known({ failureKind: "mismatch" }), NEW);
    assert.deepEqual(d, { action: "blocked", reason: "mismatch", message: MISMATCH_RECOVERY_MESSAGE });
  });
  it("proven revert -> replace; same hash -> same; none -> free", () => {
    assert.equal(replacementDecision(known({ failureKind: "reverted" }), NEW).action, "replace");
    assert.equal(replacementDecision(known({ failureKind: "reverted" }), OLD).action, "same");
    assert.equal(replacementDecision(null, NEW).action, "free");
  });
});

describe("failed transaction ledger (PGLite)", () => {
  it("revert -> replace: owner may supersede, old row preserved in history", async () => {
    await seed("g-revert");
    await markTransactionFailed(sql, "g-revert", "arm_guard", OLD, "reverted", "execution error");
    await supersedeFailedTransaction(sql, "g-revert", "arm_guard", OLD, NEW);
    assert.equal((await pg.query(`select 1 from guard_transactions where guard_id='g-revert'`)).rows.length, 0);
    const hist = (await pg.query<{ tx_hash: string; superseded_by: string; failure_kind: string }>(
      `select tx_hash, superseded_by, failure_kind from guard_transaction_history where guard_id='g-revert'`,
    )).rows;
    assert.deepEqual(hist, [{ tx_hash: OLD, superseded_by: NEW, failure_kind: "reverted" }]);
    assert.equal((await pg.query<{ tx_arm: string | null }>(`select tx_arm from guards where id='g-revert'`)).rows[0]!.tx_arm, null);
  });

  it("pending/mismatch rows are never superseded by the store", async () => {
    await seed("g-pending", "arm_guard", "0x" + "c".repeat(64));
    await supersedeFailedTransaction(sql, "g-pending", "arm_guard", "0x" + "c".repeat(64), NEW);
    assert.equal((await pg.query(`select 1 from guard_transactions where guard_id='g-pending'`)).rows.length, 1);
    assert.equal((await pg.query(`select 1 from guard_transaction_history where guard_id='g-pending'`)).rows.length, 0);
  });

  it("create_guard intent + legacy columns reopen after a proven revert", async () => {
    const hash = "0x" + "d".repeat(64);
    await pg.query(`insert into guards (id, owner_address, tx_create) values ('g-create','0xowner',$1)`, [hash]);
    await pg.query(
      `insert into create_guard_intents (guard_id, idempotency_key, wallet, version, definition_hash, chain_id, contract_address, claim_token, state, tx_hash)
       values ('g-create','k','0xowner',1,'h',61997,'0xc','t','SUBMITTED',$1)`,
      [hash],
    );
    await pg.query(
      `insert into guard_transactions (guard_id, operation, tx_hash, originating_wallet, chain_id, contract_address)
       values ('g-create','create_guard',$1,'0xowner',61997,'0xc')`,
      [hash],
    );
    await markTransactionFailed(sql, "g-create", "create_guard", hash, "reverted", "x");
    await supersedeFailedTransaction(sql, "g-create", "create_guard", hash, null);
    const intent = (await pg.query<{ tx_hash: string | null; state: string }>(`select tx_hash, state from create_guard_intents where guard_id='g-create'`)).rows[0]!;
    assert.deepEqual(intent, { tx_hash: null, state: "RELEASED" });
    assert.equal((await pg.query<{ tx_create: string | null }>(`select tx_create from guards where id='g-create'`)).rows[0]!.tx_create, null);
    assert.equal((await pg.query(`select 1 from guard_transaction_history where tx_hash=$1`, [hash])).rows.length, 1);
  });
});

describe("operation reservations (PGLite)", () => {
  before(async () => {
    await pg.query(`insert into guards (id, owner_address, onchain_id) values ('g-res','0xowner','9')`);
  });
  const base = { guardId: "g-res", operation: "evaluate_guard", wallet: "0xOwner" };

  it("double-tab -> reserved: second token refused before signing; same token idempotent", async () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    assert.equal((await reserveOperationSlot(sql, { ...base, token: "tab-a", now: t0 })).canSubmit, true);
    assert.equal((await reserveOperationSlot(sql, { ...base, token: "tab-a", now: t0 })).canSubmit, true);
    const b = await reserveOperationSlot(sql, { ...base, token: "tab-b", now: t0 });
    assert.equal(b.canSubmit, false);
    assert.match(b.message ?? "", /already in progress/);
    assert.equal(await reservedByOther(sql, "g-res", "evaluate_guard", "tab-b", t0), true);
  });

  it("expired hashless reservation can be taken over", async () => {
    const later = new Date(Date.parse("2026-01-01T00:00:00Z") + RESERVATION_TTL_MS + 1000);
    assert.equal((await reserveOperationSlot(sql, { ...base, token: "tab-b", now: later })).canSubmit, true);
    assert.equal((await reserveOperationSlot(sql, { ...base, token: "tab-a", now: later })).canSubmit, false);
  });

  it("release frees the slot", async () => {
    const now = new Date(Date.parse("2026-01-01T00:00:00Z") + RESERVATION_TTL_MS + 2000);
    await releaseOperationSlot(sql, "g-res", "evaluate_guard", "tab-a"); // wrong token: no-op
    assert.equal((await reserveOperationSlot(sql, { ...base, token: "tab-a", now })).canSubmit, false);
    await releaseOperationSlot(sql, "g-res", "evaluate_guard", "tab-b");
    assert.equal((await reserveOperationSlot(sql, { ...base, token: "tab-a", now })).canSubmit, true);
  });
});
