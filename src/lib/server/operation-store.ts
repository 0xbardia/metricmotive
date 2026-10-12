/**
 * Write-path ledger rules: replacing a PROVEN-failed transaction and reserving
 * a hashless wallet request. Kept free of app aliases (takes a `{ query }`) so
 * the same SQL runs under node:test on PGLite and in repo.ts on Neon.
 */
export type SqlLike = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

export type FailureKind = "reverted" | "mismatch" | "failed";

export type KnownTransaction = {
  txHash: string;
  reconciledAt: string | null;
  failureKind: FailureKind | null;
};

/**
 * Run id to store with a transaction: only submit_evidence carries one, and the
 * Run must belong to the same Guard. Pure so it runs under node:test.
 */
export function resolveTxRunId(
  operation: string,
  runId: string | null | undefined,
  runGuardId: string | null | undefined,
  guardId: string,
): { ok: true; runId: string | null } | { ok: false; message: string } {
  if (operation !== "submit_evidence" || !runId) return { ok: true, runId: null };
  if (runGuardId !== guardId) return { ok: false, message: "Run does not belong to this guard" };
  return { ok: true, runId };
}

/** A hashless reservation older than this is a closed tab, not a live signer. */
export const RESERVATION_TTL_MS = 10 * 60_000;

export const MISMATCH_RECOVERY_MESSAGE =
  "This transaction does not match the Guard it was recorded for, so it cannot be replaced. Keep the transaction hash and contact support to recover this Guard.";
export const FAILED_RECOVERY_MESSAGE =
  "This transaction failed on GenLayer without a verifiable result, so it cannot be replaced automatically. Keep the transaction hash and contact support to recover this Guard.";
export const STILL_CONFIRMING_MESSAGE =
  "A transaction for this step is still confirming. Wait for it to finish; no new transaction will be requested.";
export const ALREADY_RECONCILED_MESSAGE = "This step is already confirmed on GenLayer.";
export const RESERVED_ELSEWHERE_MESSAGE =
  "This step is already in progress in another tab or session. Finish or wait for it there; no signature was requested here.";

export type ReplacementDecision =
  | { action: "free" | "same" | "replace" }
  | { action: "blocked"; reason: "reconciled" | "pending" | "mismatch" | "failed"; message: string };

/**
 * May `incomingHash` (null = a reservation, no hash yet) take over this
 * operation? Only a server-proven revert is replaceable; pending/undecided and
 * mismatched transactions stay locked.
 */
export function replacementDecision(
  existing: KnownTransaction | null,
  incomingHash: string | null,
): ReplacementDecision {
  if (!existing) return { action: "free" };
  if (incomingHash && existing.txHash.toLowerCase() === incomingHash.toLowerCase()) return { action: "same" };
  if (existing.reconciledAt) return { action: "blocked", reason: "reconciled", message: ALREADY_RECONCILED_MESSAGE };
  if (existing.failureKind === "reverted") return { action: "replace" };
  if (existing.failureKind === "mismatch") return { action: "blocked", reason: "mismatch", message: MISMATCH_RECOVERY_MESSAGE };
  if (existing.failureKind === "failed") return { action: "blocked", reason: "failed", message: FAILED_RECOVERY_MESSAGE };
  return { action: "blocked", reason: "pending", message: STILL_CONFIRMING_MESSAGE };
}

const LEGACY_COLUMN: Record<string, string> = {
  create_guard: "tx_create",
  arm_guard: "tx_arm",
  submit_evidence: "tx_evidence",
  evaluate_guard: "tx_evaluate",
};

/** Stamp server-verified failure on the recorded row(s). Never called from client claims. */
export async function markTransactionFailed(
  sql: SqlLike,
  guardId: string,
  operation: string,
  txHash: string,
  kind: FailureKind,
  reason: string,
): Promise<void> {
  await sql.query(
    `update guard_transactions set failure_kind=$4, failure_reason=$5, failed_at=coalesce(failed_at,now())
       where guard_id=$1 and operation=$2 and lower(tx_hash)=lower($3) and reconciled_at is null`,
    [guardId, operation, txHash, kind, reason],
  );
  if (operation === "create_guard") {
    await sql.query(
      `update create_guard_intents set failure_kind=$3, failure_reason=$4, failed_at=coalesce(failed_at,now())
         where guard_id=$1 and lower(tx_hash)=lower($2) and reconciled_at is null`,
      [guardId, txHash, kind, reason],
    );
  }
}

/**
 * Archive a proven-reverted transaction and free its operation slot. The
 * history insert runs first and is idempotent, so a crash midway is re-runnable.
 */
export async function supersedeFailedTransaction(
  sql: SqlLike,
  guardId: string,
  operation: string,
  oldHash: string,
  supersededBy: string | null,
): Promise<void> {
  await sql.query(
    `insert into guard_transaction_history (
       guard_id, operation, tx_hash, originating_wallet, chain_id, contract_address,
       expected_guard_id, expected_evidence_hash, submitted_at, failure_kind,
       failure_reason, failed_at, superseded_by, run_id)
     select guard_id, operation, tx_hash, originating_wallet, chain_id, contract_address,
            expected_guard_id, expected_evidence_hash, submitted_at, failure_kind,
            failure_reason, failed_at, $4, run_id
       from guard_transactions
      where guard_id=$1 and operation=$2 and lower(tx_hash)=lower($3)
        and failure_kind='reverted' and reconciled_at is null
     on conflict (tx_hash) do nothing`,
    [guardId, operation, oldHash, supersededBy],
  );
  if (operation === "create_guard") {
    // A create hash may live only in the intent row (pre-ledger guards).
    await sql.query(
      `insert into guard_transaction_history (
         guard_id, operation, tx_hash, originating_wallet, chain_id, contract_address,
         submitted_at, failure_kind, failure_reason, failed_at, superseded_by)
       select guard_id, 'create_guard', tx_hash, wallet, chain_id, contract_address,
              created_at, failure_kind, failure_reason, failed_at, $3
         from create_guard_intents
        where guard_id=$1 and lower(tx_hash)=lower($2)
          and failure_kind='reverted' and reconciled_at is null
       on conflict (tx_hash) do nothing`,
      [guardId, oldHash, supersededBy],
    );
  }
  const archived = await sql.query<{ n: number }>(
    `select count(*) as n from guard_transaction_history where guard_id=$1 and lower(tx_hash)=lower($2)`,
    [guardId, oldHash],
  );
  if (!Number(archived[0]?.n)) return; // nothing proven: leave every row untouched
  await sql.query(
    `delete from guard_transactions
      where guard_id=$1 and operation=$2 and lower(tx_hash)=lower($3) and reconciled_at is null`,
    [guardId, operation, oldHash],
  );
  const legacy = LEGACY_COLUMN[operation];
  if (operation === "create_guard") {
    await sql.query(
      `update create_guard_intents set tx_hash=null, state='RELEASED', failure_kind=null,
         failure_reason=null, failed_at=null, reconciled_at=null, updated_at=now()
       where guard_id=$1 and lower(tx_hash)=lower($2) and reconciled_at is null`,
      [guardId, oldHash],
    );
    await sql.query(
      `update guards set tx_create=null, tx_create_operation=null, tx_create_owner=null,
         tx_create_chain_id=null, tx_create_contract=null, tx_create_submitted_at=null, updated_at=now()
       where id=$1 and lower(tx_create)=lower($2) and onchain_id is null`,
      [guardId, oldHash],
    );
  } else if (legacy) {
    await sql.query(
      `update guards set ${legacy}=null, updated_at=now() where id=$1 and lower(${legacy})=lower($2)`,
      [guardId, oldHash],
    );
  }
}

export type OperationReservation = {
  canSubmit: boolean;
  state: "RESERVED" | "BUSY";
  message: string | null;
};

/**
 * Atomic pre-signature gate for arm/evidence/evaluate (primary key is the
 * cross-request lock). Same token = idempotent refresh; a different token is
 * refused until the holder releases, records a hash, or goes stale.
 */
export async function reserveOperationSlot(
  sql: SqlLike,
  input: { guardId: string; operation: string; wallet: string; token: string; now?: Date },
): Promise<OperationReservation> {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - RESERVATION_TTL_MS).toISOString();
  const at = now.toISOString();
  await sql.query(
    `delete from guard_operation_reservations where guard_id=$1 and operation=$2 and updated_at < $3::timestamptz`,
    [input.guardId, input.operation, cutoff],
  );
  const inserted = await sql.query(
    `insert into guard_operation_reservations (guard_id, operation, wallet, claim_token, created_at, updated_at)
     values ($1,$2,$3,$4,$5::timestamptz,$5::timestamptz)
     on conflict (guard_id, operation) do nothing returning guard_id`,
    [input.guardId, input.operation, input.wallet, input.token, at],
  );
  if (inserted[0]) return { canSubmit: true, state: "RESERVED", message: null };
  const refreshed = await sql.query(
    `update guard_operation_reservations set updated_at=$4::timestamptz
      where guard_id=$1 and operation=$2 and claim_token=$3 and lower(wallet)=lower($5) returning guard_id`,
    [input.guardId, input.operation, input.token, at, input.wallet],
  );
  if (refreshed[0]) return { canSubmit: true, state: "RESERVED", message: null };
  return { canSubmit: false, state: "BUSY", message: RESERVED_ELSEWHERE_MESSAGE };
}

export async function releaseOperationSlot(
  sql: SqlLike,
  guardId: string,
  operation: string,
  token: string,
): Promise<void> {
  await sql.query(
    `delete from guard_operation_reservations where guard_id=$1 and operation=$2 and claim_token=$3`,
    [guardId, operation, token],
  );
}

/** True when a live reservation belongs to a different token than `token`. */
export async function reservedByOther(
  sql: SqlLike,
  guardId: string,
  operation: string,
  token: string,
  now: Date = new Date(),
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - RESERVATION_TTL_MS).toISOString();
  const rows = await sql.query(
    `select 1 as held from guard_operation_reservations
      where guard_id=$1 and operation=$2 and claim_token <> $3 and updated_at >= $4::timestamptz`,
    [guardId, operation, token, cutoff],
  );
  return rows.length > 0;
}

/** The recorded hash is the lock from here on; drop the hashless reservation. */
export async function clearOperationSlot(sql: SqlLike, guardId: string, operation: string): Promise<void> {
  await sql.query(`delete from guard_operation_reservations where guard_id=$1 and operation=$2`, [guardId, operation]);
}
