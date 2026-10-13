import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  CREATE_EXISTING_MESSAGE,
  FAILED_RECOVERY_MESSAGE,
  blockedCreateOutcome,
  MISMATCH_RECOVERY_MESSAGE,
  RESERVATION_TTL_MS,
  markTransactionFailed,
  releaseOperationSlot,
  replacementDecision,
  reserveOperationSlot,
  reservedByOther,
  supersedeFailedTransaction,
  type FailureKind,
  type SqlLike,
} from "./operation-store.ts";

const RUN = Math.random().toString(16).slice(2, 10);
const hx = (c: string) => "0x" + RUN + c.repeat(56);
const OLD = hx("a");
const NEW = hx("b");
// Real Postgres (migrations pre-applied by the caller) when set; else PGLite.
const PG_URL = process.env.OPERATION_STORE_TEST_PG_URL;
let pg: { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }> };
let sql: SqlLike;
let closePool: () => Promise<void> = async () => {};

before(async () => {
  if (PG_URL) {
    const { default: pgPkg } = await import("pg");
    const pool = new pgPkg.Pool({ connectionString: PG_URL });
    pg = pool as never;
    closePool = () => pool.end();
  } else {
    const lite = new PGlite();
    await lite.waitReady;
    const dir = new URL("../../../migrations/", import.meta.url);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      await lite.exec(readFileSync(new URL(file, dir), "utf8"));
    }
    pg = lite as never;
  }
  sql = { query: async (text, params) => (await pg.query(text, params as never[])).rows as never };
});
after(() => closePool());

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
  it("stamped failed -> blocked with the one failed message, never replaceable; same text the reconcile path returns", () => {
    const d = replacementDecision(known({ failureKind: "failed" }), NEW);
    assert.deepEqual(d, { action: "blocked", reason: "failed", message: FAILED_RECOVERY_MESSAGE });
    assert.notEqual(FAILED_RECOVERY_MESSAGE, MISMATCH_RECOVERY_MESSAGE);
    // chain-reconciliation returns this constant as the reconcile message and repo.ts surfaces decision.message.
    const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(src("./chain-reconciliation.ts"), /kind === "failed"\s*\?\s*FAILED_RECOVERY_MESSAGE/);
    assert.match(src("./chain-reconciliation.ts"), /kind === "mismatch"\s*\?\s*`\$\{error\.message\} \$\{MISMATCH_RECOVERY_MESSAGE\}`/);
    assert.match(src("./repo.ts"), /decision\.message/);
    assert.match(src("./operation-store.ts"), /reason === "failed"/);
  });
  it("proven revert -> replace; same hash -> same; none -> free", () => {
    assert.equal(replacementDecision(known({ failureKind: "reverted" }), NEW).action, "replace");
    assert.equal(replacementDecision(known({ failureKind: "reverted" }), OLD).action, "same");
    assert.equal(replacementDecision(null, NEW).action, "free");
  });
});

describe("blocked create reservation carries failureKind", () => {
  it("mismatch / failed carry kind + recovery message; reverted and pending carry the resume message", () => {
    assert.deepEqual(blockedCreateOutcome(known({ failureKind: "mismatch" })!), { failureKind: "mismatch", message: MISMATCH_RECOVERY_MESSAGE });
    assert.deepEqual(blockedCreateOutcome(known({ failureKind: "failed" })!), { failureKind: "failed", message: FAILED_RECOVERY_MESSAGE });
    assert.deepEqual(blockedCreateOutcome(known({ failureKind: "reverted" })!), { failureKind: "reverted", message: CREATE_EXISTING_MESSAGE });
    assert.deepEqual(blockedCreateOutcome(known()!), { failureKind: null, message: CREATE_EXISTING_MESSAGE });
  });

  it("ledger row stamped by markTransactionFailed yields the same outcome (PGLite)", async () => {
    for (const kind of ["mismatch", "failed", "reverted"] as const) {
      const id = `g-cb-${kind}-${RUN}`;
      const hash = hx(kind[0]!) ;
      await pg.query(`insert into guards (id, owner_address, tx_create) values ($1,'0xowner',$2)`, [id, hash]);
      await pg.query(
        `insert into guard_transactions (guard_id, operation, tx_hash, originating_wallet, chain_id, contract_address)
         values ($1,'create_guard',$2,'0xowner',61997,'0xc')`,
        [id, hash],
      );
      await markTransactionFailed(sql, id, "create_guard", hash, kind, "x");
      const row = (await pg.query<{ failure_kind: FailureKind }>(`select failure_kind from guard_transactions where guard_id=$1`, [id])).rows[0]!;
      assert.equal(blockedCreateOutcome({ txHash: hash, reconciledAt: null, failureKind: row.failure_kind }).failureKind, kind);
    }
  });
});

describe("failed transaction ledger (PGLite)", () => {
  it("revert -> replace: owner may supersede, old row preserved in history", async () => {
    await seed(`g-revert-${RUN}`);
    await markTransactionFailed(sql, `g-revert-${RUN}`, "arm_guard", OLD, "reverted", "execution error");
    await supersedeFailedTransaction(sql, `g-revert-${RUN}`, "arm_guard", OLD, NEW);
    assert.equal((await pg.query(`select 1 from guard_transactions where guard_id='g-revert-${RUN}'`)).rows.length, 0);
    const hist = (await pg.query<{ tx_hash: string; superseded_by: string; failure_kind: string }>(
      `select tx_hash, superseded_by, failure_kind from guard_transaction_history where guard_id='g-revert-${RUN}'`,
    )).rows;
    assert.deepEqual(hist, [{ tx_hash: OLD, superseded_by: NEW, failure_kind: "reverted" }]);
    assert.equal((await pg.query<{ tx_arm: string | null }>(`select tx_arm from guards where id='g-revert-${RUN}'`)).rows[0]!.tx_arm, null);
  });

  it("pending/mismatch rows are never superseded by the store", async () => {
    await seed(`g-pending-${RUN}`, "arm_guard", hx("c"));
    await supersedeFailedTransaction(sql, `g-pending-${RUN}`, "arm_guard", hx("c"), NEW);
    assert.equal((await pg.query(`select 1 from guard_transactions where guard_id='g-pending-${RUN}'`)).rows.length, 1);
    assert.equal((await pg.query(`select 1 from guard_transaction_history where guard_id='g-pending-${RUN}'`)).rows.length, 0);
  });

  it("create_guard intent + legacy columns reopen after a proven revert", async () => {
    const hash = hx("d");
    await pg.query(`insert into guards (id, owner_address, tx_create) values ('g-create-${RUN}','0xowner',$1)`, [hash]);
    await pg.query(
      `insert into create_guard_intents (guard_id, idempotency_key, wallet, version, definition_hash, chain_id, contract_address, claim_token, state, tx_hash)
       values ('g-create-${RUN}','k-${RUN}','0xowner',1,'h',61997,'0xc','t','SUBMITTED',$1)`,
      [hash],
    );
    await pg.query(
      `insert into guard_transactions (guard_id, operation, tx_hash, originating_wallet, chain_id, contract_address)
       values ('g-create-${RUN}','create_guard',$1,'0xowner',61997,'0xc')`,
      [hash],
    );
    await markTransactionFailed(sql, `g-create-${RUN}`, "create_guard", hash, "reverted", "x");
    await supersedeFailedTransaction(sql, `g-create-${RUN}`, "create_guard", hash, null);
    const intent = (await pg.query<{ tx_hash: string | null; state: string }>(`select tx_hash, state from create_guard_intents where guard_id='g-create-${RUN}'`)).rows[0]!;
    assert.deepEqual(intent, { tx_hash: null, state: "RELEASED" });
    assert.equal((await pg.query<{ tx_create: string | null }>(`select tx_create from guards where id='g-create-${RUN}'`)).rows[0]!.tx_create, null);
    assert.equal((await pg.query(`select 1 from guard_transaction_history where tx_hash=$1`, [hash])).rows.length, 1);
  });
});

describe("operation reservations (PGLite)", () => {
  before(async () => {
    await pg.query(`insert into guards (id, owner_address, onchain_id) values ('g-res-${RUN}','0xowner','9')`);
  });
  const base = { guardId: `g-res-${RUN}`, operation: "evaluate_guard", wallet: "0xOwner" };

  it("double-tab -> reserved: second token refused before signing; same token idempotent", async () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    assert.equal((await reserveOperationSlot(sql, { ...base, token: "tab-a", now: t0 })).canSubmit, true);
    assert.equal((await reserveOperationSlot(sql, { ...base, token: "tab-a", now: t0 })).canSubmit, true);
    const b = await reserveOperationSlot(sql, { ...base, token: "tab-b", now: t0 });
    assert.equal(b.canSubmit, false);
    assert.match(b.message ?? "", /already in progress/);
    assert.equal(await reservedByOther(sql, `g-res-${RUN}`, "evaluate_guard", "tab-b", t0), true);
  });

  it("expired hashless reservation can be taken over", async () => {
    const later = new Date(Date.parse("2026-01-01T00:00:00Z") + RESERVATION_TTL_MS + 1000);
    assert.equal((await reserveOperationSlot(sql, { ...base, token: "tab-b", now: later })).canSubmit, true);
    assert.equal((await reserveOperationSlot(sql, { ...base, token: "tab-a", now: later })).canSubmit, false);
  });

  it("release frees the slot", async () => {
    const now = new Date(Date.parse("2026-01-01T00:00:00Z") + RESERVATION_TTL_MS + 2000);
    await releaseOperationSlot(sql, `g-res-${RUN}`, "evaluate_guard", "tab-a"); // wrong token: no-op
    assert.equal((await reserveOperationSlot(sql, { ...base, token: "tab-a", now })).canSubmit, false);
    await releaseOperationSlot(sql, `g-res-${RUN}`, "evaluate_guard", "tab-b");
    assert.equal((await reserveOperationSlot(sql, { ...base, token: "tab-a", now })).canSubmit, true);
  });
});

import { resolveTxRunId } from "./operation-store.ts";
it("resolveTxRunId stores run for submit_evidence and rejects another guard's run", () => {
  assert.deepEqual(resolveTxRunId("submit_evidence", "r1", "g1", "g1"), { ok: true, runId: "r1" });
  assert.equal(resolveTxRunId("submit_evidence", "r1", "g2", "g1").ok, false);
  assert.equal(resolveTxRunId("submit_evidence", "r1", null, "g1").ok, false);
  assert.deepEqual(resolveTxRunId("arm_guard", "r1", "g2", "g1"), { ok: true, runId: null });
});
