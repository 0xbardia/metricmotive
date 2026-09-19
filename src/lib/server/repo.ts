import { getSql } from "@/lib/db";
import {
  type Authority,
  type EvidenceManifest,
  type Findings,
  type Guard,
  type Guardrail,
  type GuardRecordClass,
  type GuardStatus,
  type GamingPattern,
  type JsonBag,
  type ReceiptSnapshot,
  type RunEvent,
  type RunRecord,
  type Verdict,
  definitionHash,
  parseGuardrails,
} from "@/lib/domain";
import {
  createGuardIdempotencyKey,
  createIntentDecision,
  type CreateIntentRecord,
  type CreateIntentState,
} from "@/lib/create-intent";
import {
  buildEvidenceManifest,
  evidenceCommitmentHash,
  evidenceManifestPreimage,
  evidenceSnapshotOf,
  replayEvidenceSnapshot,
  requireEvidenceEvents,
  type RunEvidenceSnapshot,
} from "@/lib/evidence";
import type { ChainOperation } from "@/lib/reconciliation";
import { AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { getActiveDeployment, guardDeployment, requireActiveWrite, resolvedDeployment } from "@/lib/contract";
import { sameWallet } from "./security";
import { parseOutcome, parseRunEvent } from "../validation";

type GuardRow = {
  id: string;
  owner_address: string;
  parent_id: string | null;
  version: number;
  motive: string;
  metric: string;
  guardrails_json: string;
  definition_hash: string;
  status: string;
  evidence_json: string;
  evidence_hash: string;
  findings_json: string;
  verdict: string | null;
  primary_pattern: string | null;
  onchain_id: string | null;
  contract_address: string | null;
  chain_id: number | null;
  network: string | null;
  tx_create: string | null;
  tx_create_operation: string | null;
  tx_create_owner: string | null;
  tx_create_chain_id: number | string | null;
  tx_create_contract: string | null;
  tx_create_submitted_at: string | null;
  tx_arm: string | null;
  tx_evidence: string | null;
  tx_evaluate: string | null;
  authority: string;
  is_example: boolean;
  record_class: string;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
  armed_at: string | null;
  evidence_at: string | null;
  resolved_at: string | null;
};

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function parseSnapshot(raw: string): ReceiptSnapshot {
  try {
    const value = JSON.parse(raw) as ReceiptSnapshot;
    if (!value || typeof value !== "object") throw new Error("not an object");
    return value;
  } catch {
    throw new AppError("DATA_CORRUPT", "Stored receipt data is invalid", 500);
  }
}

function mapGuard(row: GuardRow): Guard {
  let findings: Findings | null = null;
  if (row.findings_json) {
    try {
      findings = JSON.parse(row.findings_json) as Findings;
    } catch {
      findings = null;
    }
  }
  return {
    id: row.id,
    ownerAddress: row.owner_address,
    parentId: row.parent_id,
    version: Number(row.version),
    motive: row.motive,
    metric: row.metric,
    guardrails: parseGuardrails(row.guardrails_json || "[]"),
    definitionHash: row.definition_hash,
    status: row.status as GuardStatus,
    evidenceJson: row.evidence_json,
    evidenceHash: row.evidence_hash,
    findings,
    verdict: (row.verdict as Verdict | null) ?? null,
    primaryPattern: (row.primary_pattern as GamingPattern | null) ?? null,
    onchainId: row.onchain_id,
    contractAddress: row.contract_address,
    chainId: row.chain_id == null ? null : Number(row.chain_id),
    network: row.network,
    txCreate: row.tx_create,
    txCreateOperation: row.tx_create_operation ?? (row.tx_create ? "create_guard" : null),
    txCreateOwner: row.tx_create_owner ?? (row.tx_create ? row.owner_address : null),
    txCreateChainId: row.tx_create_chain_id == null
      ? row.tx_create ? row.chain_id : null
      : Number(row.tx_create_chain_id),
    txCreateContract: row.tx_create_contract ?? (row.tx_create ? row.contract_address : null),
    txCreateSubmittedAt: row.tx_create_submitted_at ?? (row.tx_create ? row.created_at : null),
    txArm: row.tx_arm,
    txEvidence: row.tx_evidence,
    txEvaluate: row.tx_evaluate,
    authority: (row.authority as Authority) ?? "LOCAL",
    isExample: asBool(row.is_example),
    recordClass: (row.record_class as GuardRecordClass) ?? "PRIMARY",
    supersededBy: row.superseded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    armedAt: row.armed_at,
    evidenceAt: row.evidence_at,
    resolvedAt: row.resolved_at,
  };
}

export async function listGuards(opts: {
  includeExamples?: boolean;
  ownerAddress?: string;
  limit?: number;
  offset?: number;
}): Promise<Guard[]> {
  const sql = await getSql();
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 50), 1), 100);
  const offset = Math.max(Math.trunc(opts.offset ?? 0), 0);
  let rows: GuardRow[];
  if (opts.includeExamples) {
    rows = await sql.query<GuardRow>(
      `select * from guards order by created_at desc, id desc limit $1 offset $2`,
      [limit, offset],
    );
  } else {
    if (!opts.ownerAddress) throw new AppError("UNAUTHENTICATED", "Wallet authentication required", 401);
    rows = await sql.query<GuardRow>(
      `select * from guards where is_example=false and lower(owner_address)=lower($1)
       order by created_at desc, id desc limit $2 offset $3`,
      [opts.ownerAddress, limit, offset],
    );
  }
  return rows.map(mapGuard);
}

export async function getGuard(id: string): Promise<Guard | null> {
  const sql = await getSql();
  const rows = await sql<GuardRow>`select * from guards where id = ${id} limit 1`;
  return rows[0] ? mapGuard(rows[0]) : null;
}

export async function requireGuard(id: string): Promise<Guard> {
  const g = await getGuard(id);
  if (!g) throw new AppError("NOT_FOUND", "Guard not found", 404);
  return g;
}

export async function requireOwnedGuard(id: string, ownerAddress: string): Promise<Guard> {
  const guard = await requireGuard(id);
  if (guard.isExample) throw new AppError("FORBIDDEN", "Example guards are read-only", 403);
  if (!sameWallet(guard.ownerAddress, ownerAddress)) {
    throw new AppError("FORBIDDEN", "You do not control this Guard", 403);
  }
  return guard;
}

export function isPublicGuard(guard: Guard): boolean {
  return guard.isExample || (guard.authority === "GENLAYER" && guard.status === "RESOLVED");
}

export async function insertGuard(input: {
  ownerAddress: string;
  parentId: string | null;
  version: number;
  motive: string;
  metric: string;
  guardrails: Guardrail[];
}): Promise<Guard> {
  const sql = await getSql();
  const id = newId("grd");
  const hash = await definitionHash(input.motive, input.metric, input.guardrails);
  await sql.query(
    `insert into guards (
      id, owner_address, parent_id, version, motive, metric, guardrails_json,
      definition_hash, status, authority, is_example, contract_address, chain_id, network
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT','LOCAL',false,$9,$10,$11)`,
    [
      id,
      input.ownerAddress,
      input.parentId,
      input.version,
      input.motive,
      input.metric,
      JSON.stringify(input.guardrails),
      hash,
      getActiveDeployment().contractAddress,
      getActiveDeployment().chainId,
      getActiveDeployment().networkName,
    ],
  );
  return requireGuard(id);
}

export async function findGuardVersion(
  parentId: string,
  version: number,
  ownerAddress: string,
): Promise<Guard | null> {
  const sql = await getSql();
  const rows = await sql.query<GuardRow>(
    `select * from guards where parent_id=$1 and version=$2
       and lower(owner_address)=lower($3) order by created_at asc, id asc limit 1`,
    [parentId, version, ownerAddress],
  );
  return rows[0] ? mapGuard(rows[0]) : null;
}

type CreateIntentRow = {
  guard_id: string;
  idempotency_key: string;
  wallet: string;
  version: number | string;
  definition_hash: string;
  chain_id: number | string;
  contract_address: string;
  claim_token: string;
  state: string;
  tx_hash: string | null;
  reconciled_at: string | null;
};

function mapCreateIntent(row: CreateIntentRow): CreateIntentRecord {
  return {
    wallet: row.wallet,
    guardId: row.guard_id,
    version: Number(row.version),
    definitionHash: row.definition_hash,
    chainId: Number(row.chain_id),
    contractAddress: row.contract_address,
    claimToken: row.claim_token,
    state: row.state as CreateIntentState,
    txHash: row.tx_hash,
  };
}

export type CreateGuardReservation = {
  idempotencyKey: string;
  state: CreateIntentState;
  txHash: string | null;
  canSubmit: boolean;
  message: string | null;
};

function reservationResult(
  row: CreateIntentRow,
  canSubmit: boolean,
): CreateGuardReservation {
  const state = row.state as CreateIntentState;
  return {
    idempotencyKey: row.idempotency_key,
    state,
    txHash: row.tx_hash,
    canSubmit,
    message: canSubmit
      ? null
      : row.tx_hash
        ? "A create transaction is already recorded for this Guard. Confirmation can resume without submitting another transaction."
        : "A create submission is already reserved for this Guard. Return to the original session or wait for its wallet request to finish.",
  };
}

export async function reserveCreateGuard(
  id: string,
  claimToken: string,
  actorAddress: string,
): Promise<CreateGuardReservation> {
  const guard = await requireOwnedGuard(id, actorAddress);
  const target = guardDeployment(guard);
  const connection = await getSql();
  await connection.query(
    `update guards set contract_address=$1, chain_id=$2, network=$3 where id=$4 and contract_address is null`,
    [target.contractAddress, target.chainId, target.network, id],
  );
  if (guard.onchainId || guard.txCreate) {
    const existing = await getChainTransaction(id, "create_guard");
    if (existing) {
      return {
        idempotencyKey: createGuardIdempotencyKey({
          wallet: guard.ownerAddress,
          guardId: guard.id,
          version: guard.version,
          definitionHash: guard.definitionHash,
          chainId: guardDeployment(guard).chainId,
          contractAddress: guardDeployment(guard).contractAddress,
        }),
        state: existing.reconciledAt ? "RECONCILED" : "SUBMITTED",
        txHash: existing.txHash,
        canSubmit: false,
        message: "This Guard already has a create transaction. Confirmation can resume without submitting another transaction.",
      };
    }
    throw new AppError("CONFLICT", "This Guard is already created or has a pending create transaction", 409);
  }
  if (!claimToken.trim()) throw new AppError("VALIDATION", "Create reservation token is required", 400);

  const identity = {
    wallet: actorAddress,
    guardId: guard.id,
    version: guard.version,
    definitionHash: guard.definitionHash,
    chainId: guardDeployment(guard).chainId,
    contractAddress: guardDeployment(guard).contractAddress,
  } as const;
  const idempotencyKey = createGuardIdempotencyKey(identity);
  const sql = await getSql();
  const select = () => sql.query<CreateIntentRow>(
    `select guard_id, idempotency_key, wallet, version, definition_hash,
            chain_id, contract_address, claim_token, state, tx_hash, reconciled_at
       from create_guard_intents where guard_id=$1 limit 1`,
    [id],
  );
  const existingRows = await select();
  const existing = existingRows[0] ? mapCreateIntent(existingRows[0]) : null;
  const decision = createIntentDecision(existing, identity);
  if (decision === "conflict") {
    throw new AppError("CONFLICT", "This Guard definition changed after create was reserved", 409);
  }
  if (decision === "existing" && existingRows[0]) {
    return reservationResult(existingRows[0], false);
  }
  if (existingRows[0]) {
    const released = await sql.query<CreateIntentRow>(
      `update create_guard_intents set idempotency_key=$1, wallet=$2, version=$3,
          definition_hash=$4, chain_id=$5, contract_address=$6, claim_token=$7,
          state='RESERVED', tx_hash=null, reconciled_at=null, updated_at=now()
       where guard_id=$8 and state='RELEASED' and tx_hash is null
       returning guard_id, idempotency_key, wallet, version, definition_hash,
                 chain_id, contract_address, claim_token, state, tx_hash, reconciled_at`,
      [idempotencyKey, identity.wallet, identity.version, identity.definitionHash,
        identity.chainId, identity.contractAddress, claimToken, id],
    );
    if (released[0]) return reservationResult(released[0], true);
  } else {
    const inserted = await sql.query<CreateIntentRow>(
      `insert into create_guard_intents (
         guard_id, idempotency_key, wallet, version, definition_hash, chain_id,
         contract_address, claim_token, state
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,'RESERVED')
       on conflict (guard_id) do nothing
       returning guard_id, idempotency_key, wallet, version, definition_hash,
                 chain_id, contract_address, claim_token, state, tx_hash, reconciled_at`,
      [id, idempotencyKey, identity.wallet, identity.version, identity.definitionHash,
        identity.chainId, identity.contractAddress, claimToken],
    );
    if (inserted[0]) return reservationResult(inserted[0], true);
  }

  // The primary-key conflict is the cross-request atomic gate. Read its winner
  // and reuse it; never turn the conflict into a second wallet submission.
  const winner = (await select())[0];
  if (winner) {
    const winnerIdentity = mapCreateIntent(winner);
    if (createIntentDecision(winnerIdentity, identity) === "conflict") {
      throw new AppError("CONFLICT", "This Guard definition changed after create was reserved", 409);
    }
    return reservationResult(winner, false);
  }
  throw new AppError("CONFLICT", "Could not reserve this create operation safely", 409);
}

export async function releaseCreateGuard(
  id: string,
  claimToken: string,
  actorAddress: string,
): Promise<void> {
  await requireOwnedGuard(id, actorAddress);
  const sql = await getSql();
  await sql.query(
    `update create_guard_intents set state='RELEASED', updated_at=now()
       where guard_id=$1 and claim_token=$2 and tx_hash is null and state='RESERVED'`,
    [id, claimToken],
  );
}

export async function updateDraft(
  id: string,
  patch: { motive: string; metric: string; guardrails: Guardrail[] },
  ownerAddress: string,
): Promise<Guard> {
  const g = await requireOwnedGuard(id, ownerAddress);
  if (g.isExample) throw new AppError("FORBIDDEN", "Example guards cannot be edited", 403);
  if (g.status !== "DRAFT") {
    throw new AppError("LOCKED", "Cannot edit a guard after it is armed", 409);
  }
  const hash = await definitionHash(patch.motive, patch.metric, patch.guardrails);
  const sql = await getSql();
  const updated = await sql.query<{ id: string }>(
    `update guards set motive=$1, metric=$2, guardrails_json=$3, definition_hash=$4, updated_at=now()
     where id=$5 and status='DRAFT' and lower(owner_address)=lower($6)
       and not exists (
         select 1 from create_guard_intents i
         where i.guard_id=guards.id and i.state <> 'RELEASED'
       )
     returning id`,
    [patch.motive, patch.metric, JSON.stringify(patch.guardrails), hash, id, ownerAddress],
  );
  if (!updated[0]) throw new AppError("CONFLICT", "Guard changed while it was being edited", 409);
  return requireGuard(id);
}

export async function armLocal(id: string, ownerAddress: string): Promise<Guard> {
  const g = await requireOwnedGuard(id, ownerAddress);
  if (g.status !== "DRAFT") throw new AppError("INVALID_STATE", "Only a draft can be armed", 409);
  if (!g.motive.trim() || !g.metric.trim()) {
    throw new AppError("INCOMPLETE", "Motive and metric are required to lock", 400);
  }
  const sql = await getSql();
  const updated = await sql.query<{ id: string }>(
    `update guards set status='ARMED', armed_at=now(), updated_at=now()
     where id=$1 and status='DRAFT' and lower(owner_address)=lower($2)
     returning id`,
    [id, ownerAddress],
  );
  if (!updated[0]) throw new AppError("CONFLICT", "Guard changed while it was being armed", 409);
  return requireGuard(id);
}

export async function attachEvidence(
  id: string,
  manifest: EvidenceManifest,
  ownerAddress: string,
): Promise<Guard> {
  requireEvidenceEvents(manifest.events);
  const g = await requireOwnedGuard(id, ownerAddress);
  if (g.status !== "ARMED") {
    throw new AppError("INVALID_STATE", "Evidence requires an armed guard", 409);
  }
  if (g.evidenceHash) {
    throw new AppError("LOCKED", "Evidence commitment cannot be replaced", 409);
  }
  const sql = await getSql();
  const updated = await sql.query<{ id: string }>(
    `update guards set evidence_json=$1, evidence_hash=$2, status='EVIDENCE_SUBMITTED',
     evidence_at=now(), updated_at=now() where id=$3 and status='ARMED'
     and lower(owner_address)=lower($4)
     returning id`,
    [JSON.stringify(manifest), manifest.manifestHash, id, ownerAddress],
  );
  if (!updated[0]) throw new AppError("CONFLICT", "Guard changed while evidence was being attached", 409);
  return requireGuard(id);
}

export async function resolveLocal(
  id: string,
  findings: Findings,
  verdict: Verdict,
  ownerAddress: string,
): Promise<Guard> {
  const g = await requireOwnedGuard(id, ownerAddress);
  if (g.status !== "EVIDENCE_SUBMITTED") {
    throw new AppError("INVALID_STATE", "Evaluation requires submitted evidence", 409);
  }
  const sql = await getSql();
  const updated = await sql.query<{ id: string }>(
    `update guards set findings_json=$1, verdict=$2, primary_pattern=$3,
     status='RESOLVED', resolved_at=now(), updated_at=now(), authority='LOCAL'
     where id=$4 and status='EVIDENCE_SUBMITTED' and lower(owner_address)=lower($5)
     returning id`,
    [JSON.stringify(findings), verdict, findings.primary_pattern, id, ownerAddress],
  );
  if (!updated[0]) throw new AppError("CONFLICT", "Guard changed while it was being evaluated", 409);
  const resolved = await requireGuard(id);
  await createReceipt(resolved);
  return resolved;
}

export async function createReceipt(guard: Guard): Promise<string> {
  const sql = await getSql();
  const id = newId("rct");
  const snapshot: ReceiptSnapshot = {
    motive: guard.motive,
    metric: guard.metric,
    version: guard.version,
    status: guard.status,
    evidenceHash: guard.evidenceHash,
    verdict: guard.verdict ?? "",
    primaryPattern: guard.primaryPattern ?? "NONE",
    authority: guard.authority,
    definitionHash: guard.definitionHash,
    network: guard.authority === "GENLAYER" ? guardDeployment(guard).network : "local-advisory",
    advisory: guard.authority !== "GENLAYER",
    example: guard.isExample,
    resolvedAt: guard.resolvedAt ?? "",
    contractAddress:
      guard.authority === "GENLAYER" ? guardDeployment(guard).contractAddress : undefined,
    chainId: guard.authority === "GENLAYER" ? guardDeployment(guard).chainId : undefined,
    onchainId: guard.onchainId ?? undefined,
    txEvaluate: guard.txEvaluate ?? undefined,
    txCreate: guard.txCreate ?? undefined,
    txArm: guard.txArm ?? undefined,
    txEvidence: guard.txEvidence ?? undefined,
  };
  const inserted = await sql.query<{ id: string }>(
    `insert into receipts (id, guard_id, is_example, snapshot_json) values ($1,$2,$3,$4)
     on conflict (guard_id) do update set
       is_example=excluded.is_example,
       snapshot_json=excluded.snapshot_json
     where receipts.snapshot_json::jsonb->>'authority' <> 'GENLAYER'
        or excluded.snapshot_json::jsonb->>'authority' = 'GENLAYER'
     returning id`,
    [id, guard.id, guard.isExample, JSON.stringify(snapshot)],
  );
  if (inserted[0]) return inserted[0].id;
  const existing = await sql<{ id: string }>`select id from receipts where guard_id = ${guard.id} limit 1`;
  if (!existing[0]) throw new AppError("RECEIPT_RETRY", "Receipt creation did not complete", 409);
  return existing[0].id;
}

export async function getReceipt(id: string) {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    guard_id: string;
    is_example: boolean | string;
    snapshot_json: string;
    created_at: string;
  }>`select * from receipts where id = ${id} limit 1`;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    guardId: row.guard_id,
    isExample: asBool(row.is_example),
    snapshot: parseSnapshot(row.snapshot_json),
    createdAt: row.created_at,
  };
}

export async function receiptForGuard(guardId: string) {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`select id from receipts where guard_id = ${guardId} limit 1`;
  return rows[0]?.id ?? null;
}

export async function insertRun(guardId: string, agentRef: string, ownerAddress: string): Promise<RunRecord> {
  const guard = await requireOwnedGuard(guardId, ownerAddress);
  if (guard.status !== "ARMED") {
    throw new AppError("GUARD_NOT_ARMED", "Run requires an ARMED Guard", 409);
  }
  const sql = await getSql();
  const id = newId("run");
  await sql.query(
    `insert into runs (id, guard_id, agent_ref, status, started_at) values ($1,$2,$3,'STARTED',$4)`,
    [id, guardId, agentRef.slice(0, 200), new Date().toISOString()],
  );
  return requireRun(id);
}

type RunRow = {
  id: string;
  guard_id: string;
  agent_ref: string;
  status: string;
  events_json: string;
  outcome_json: string;
  started_at: string;
  completed_at: string | null;
  evidence_snapshot_json?: string | null;
  evidence_manifest_hash?: string | null;
  evidence_commitment_hash?: string | null;
};

function mapRun(row: RunRow): RunRecord {
  let events: RunEvent[];
  let outcome: JsonBag;
  try {
    const rawEvents: unknown = JSON.parse(row.events_json || "[]");
    const rawOutcome: unknown = JSON.parse(row.outcome_json || "{}");
    if (!Array.isArray(rawEvents) || !rawOutcome || typeof rawOutcome !== "object") {
      throw new Error("invalid stored run JSON");
    }
    events = rawEvents.map((event) => parseRunEvent(event));
    outcome = parseOutcome(rawOutcome);
  } catch {
    throw new AppError("DATA_CORRUPT", "Stored run data is invalid", 500);
  }
  return {
    id: row.id,
    guardId: row.guard_id,
    agentRef: row.agent_ref,
    status: row.status as RunRecord["status"],
    events,
    outcome,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    evidenceSnapshotJson: row.evidence_snapshot_json ?? null,
    evidenceManifestHash: row.evidence_manifest_hash ?? null,
    evidenceCommitmentHash: row.evidence_commitment_hash ?? null,
  };
}

export async function requireRun(id: string): Promise<RunRecord> {
  const sql = await getSql();
  const rows = await sql<RunRow>`select * from runs where id = ${id} limit 1`;
  if (!rows[0]) throw new AppError("NOT_FOUND", "Run not found", 404);
  return mapRun(rows[0]);
}

export async function requireOwnedRun(id: string, ownerAddress: string): Promise<RunRecord> {
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(
    `select r.id from runs r join guards g on g.id=r.guard_id
     where r.id=$1 and lower(g.owner_address)=lower($2) and g.is_example=false limit 1`,
    [id, ownerAddress],
  );
  if (!rows[0]) throw new AppError("FORBIDDEN", "You do not control this Run", 403);
  return requireRun(id);
}

export async function appendRunEvent(id: string, event: RunEvent, ownerAddress: string): Promise<RunRecord> {
  await requireOwnedRun(id, ownerAddress);
  const sql = await getSql();
  const updated = await sql.query(
    `update runs
     set events_json=(events_json::jsonb || jsonb_build_array($1::jsonb))::text
     where id=$2 and status='STARTED' and jsonb_array_length(events_json::jsonb) < 80
       and exists (select 1 from guards g where g.id=runs.guard_id and g.is_example=false
                   and lower(g.owner_address)=lower($3))
     returning id`,
    [JSON.stringify(event), id, ownerAddress],
  );
  if (updated.length === 0) {
    const run = await requireRun(id);
    if (run.status !== "STARTED") throw new AppError("INVALID_STATE", "Cannot append to a finished run", 409);
    throw new AppError("LIMIT", "Too many run events", 400);
  }
  return requireRun(id);
}

export async function finishRun(
  id: string,
  outcome: JsonBag,
  ownerAddress: string,
): Promise<RunRecord> {
  const run = await requireOwnedRun(id, ownerAddress);
  const guard = await requireGuard(run.guardId);
  const sql = await getSql();

  // Pin the canonical evidence ONCE, while the Run is still open. The evidence
  // is committed to the on-chain Guard, so the on-chain id is the manifest's
  // guardId; a Run whose Guard is not yet published has nothing to commit and
  // is finished without a snapshot (the local advisory path covers it).
  const guardId = guard.onchainId ?? null;
  let snapshot: RunEvidenceSnapshot | null = null;
  if (guardId) {
    requireEvidenceEvents(run.events);
    snapshot = await evidenceSnapshotOf(
      await buildEvidenceManifest({
        guardId,
        run: { ...run, completedAt: run.completedAt ?? new Date().toISOString() },
      }),
    );
  }

  const updated = await sql.query(
    `update runs set status='FINISHED', outcome_json=$1, completed_at=$2,
       evidence_snapshot_json=$3, evidence_manifest_hash=$4, evidence_commitment_hash=$5
     where id=$6 and status='STARTED'
       and exists (select 1 from guards g where g.id=runs.guard_id and lower(g.owner_address)=lower($7))
     returning id`,
    [
      JSON.stringify(outcome),
      snapshot ? snapshot.manifest.completedAt : new Date().toISOString(),
      snapshot ? snapshot.encoded : null,
      snapshot ? snapshot.manifestHash : null,
      snapshot ? snapshot.commitmentHash : null,
      id,
      ownerAddress,
    ],
  );
  if (!updated.length) throw new AppError("INVALID_STATE", "Run already finished", 409);
  return requireRun(id);
}

/**
 * The pinned snapshot for a finished Run, captured on first need.
 *
 * Runs finished before snapshots existed have none; because nothing has been
 * committed yet for those, building and persisting it now is safe and is what
 * keeps every later read on one immutable set of bytes.
 */
export async function ensureRunEvidenceSnapshot(
  run: RunRecord,
  guardId: string,
): Promise<RunEvidenceSnapshot> {
  if (run.status !== "FINISHED") {
    throw new AppError("INVALID_STATE", "Finish the run before submitting evidence", 409);
  }
  if (run.evidenceSnapshotJson) {
    return replayEvidenceSnapshot(run.evidenceSnapshotJson);
  }
  requireEvidenceEvents(run.events);
  const snapshot = await evidenceSnapshotOf(
    await buildEvidenceManifest({
      guardId,
      run: { ...run, completedAt: run.completedAt ?? new Date().toISOString() },
    }),
  );
  const sql = await getSql();
  await sql.query(
    `update runs set evidence_snapshot_json=$1, evidence_manifest_hash=$2,
       evidence_commitment_hash=$3, evidence_committed_at=coalesce(evidence_committed_at,now())
     where id=$4 and evidence_snapshot_json is null`,
    [snapshot.encoded, snapshot.manifestHash, snapshot.commitmentHash, run.id],
  );
  return snapshot;
}

/**
 * Resolve the evidence snapshot a submitted transaction must be compared to.
 *
 * Snapshot-backed Runs replay pinned bytes. A Run finished before snapshots
 * existed is recovered by proving the submitted manifest is canonically
 * identical to the persisted Run, then pinning the SUBMITTED bytes — the
 * transaction is the submission of record, so this recovers, never fabricates.
 * Any difference fails closed.
 */
export async function resolveRunEvidenceSnapshot(
  run: RunRecord,
  submitted: EvidenceManifest,
): Promise<RunEvidenceSnapshot> {
  if (run.status !== "FINISHED") {
    throw new AppError("MISMATCH", "The submitted evidence belongs to a Run that is not finished.", 409);
  }
  if (run.evidenceSnapshotJson) {
    const snapshot = await replayEvidenceSnapshot(run.evidenceSnapshotJson);
    if (evidenceManifestPreimage(submitted) !== evidenceManifestPreimage(snapshot.manifest)) {
      throw new AppError("MISMATCH", "The submitted evidence does not match the pinned Run snapshot.", 409);
    }
    return snapshot;
  }

  const rebuilt = await buildEvidenceManifest({ guardId: submitted.guardId, run });
  if (evidenceManifestPreimage(submitted) !== evidenceManifestPreimage(rebuilt)) {
    throw new AppError("MISMATCH", "The submitted evidence does not match the persisted Run snapshot.", 409);
  }
  const commitmentHash = await evidenceCommitmentHash(submitted);
  const sql = await getSql();
  await sql.query(
    `update runs set evidence_snapshot_json=$1, evidence_manifest_hash=$2,
       evidence_commitment_hash=$3, evidence_committed_at=coalesce(evidence_committed_at,now())
     where id=$4 and evidence_snapshot_json is null`,
    [JSON.stringify(submitted), submitted.manifestHash, commitmentHash, run.id],
  );
  return {
    manifest: submitted,
    encoded: JSON.stringify(submitted),
    manifestHash: submitted.manifestHash,
    commitmentHash,
  };
}


export async function listRuns(guardId: string, ownerAddress?: string, limit = 50, offset = 0): Promise<RunRecord[]> {
  const sql = await getSql();
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const boundedOffset = Math.max(Math.trunc(offset), 0);
  const rows = ownerAddress
    ? await sql<RunRow>`select r.* from runs r join guards g on g.id=r.guard_id
        where r.guard_id = ${guardId} and g.is_example=false
          and lower(g.owner_address)=lower(${ownerAddress})
        order by r.started_at desc, r.id desc limit ${boundedLimit} offset ${boundedOffset}`
    : await sql<RunRow>`select * from runs where guard_id = ${guardId}
    order by started_at desc, id desc limit ${boundedLimit} offset ${boundedOffset}`;
  return rows.map(mapRun);
}

export async function listRunsForOwner(ownerAddress: string, limit = 50, offset = 0): Promise<RunRecord[]> {
  const sql = await getSql();
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const boundedOffset = Math.max(Math.trunc(offset), 0);
  const rows = await sql<RunRow>`select r.* from runs r join guards g on g.id=r.guard_id
    where g.is_example=false and lower(g.owner_address)=lower(${ownerAddress})
    order by r.started_at desc, r.id desc limit ${boundedLimit} offset ${boundedOffset}`;
  return rows.map(mapRun);
}

export async function saveAdvisory(
  guardId: string,
  kind: string,
  result: unknown,
  model: string,
  ownerAddress: string,
): Promise<void> {
  await requireOwnedGuard(guardId, ownerAddress);
  const sql = await getSql();
  await sql.query(
    `insert into advisory_reports (id, guard_id, kind, result_json, model) values ($1,$2,$3,$4,$5)`,
    [newId("adv"), guardId, kind, JSON.stringify(result), model],
  );
}

export async function recordActionAudit(input: {
  actionName: string;
  resourceId?: string | null;
  actorWallet: string;
  route: string;
  idempotencyKey?: string | null;
  operationId?: string | null;
}): Promise<void> {
  const sql = await getSql();
  await sql.query(
    `insert into ui_action_audit (
       id, action_name, resource_id, actor_wallet, route, idempotency_key, operation_id
     ) values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      newId("act"),
      input.actionName,
      input.resourceId ?? null,
      input.actorWallet,
      input.route,
      input.idempotencyKey ?? null,
      input.operationId ?? null,
    ],
  );
}

export async function analytics(ownerAddress: string) {
  const sql = await getSql();
  const [summary] = await sql<{
    finalized: number;
    faithful_success: number;
    partial_alignment: number;
    metric_gaming: number;
    insufficient_evidence: number;
  }>`select
      count(*)::int as finalized,
      count(*) filter (where verdict='FAITHFUL_SUCCESS')::int as faithful_success,
      count(*) filter (where verdict='PARTIAL_ALIGNMENT')::int as partial_alignment,
      count(*) filter (where verdict='METRIC_GAMING')::int as metric_gaming,
      count(*) filter (where verdict='INSUFFICIENT_EVIDENCE')::int as insufficient_evidence
    from guards
    where is_example = false and status = 'RESOLVED' and lower(owner_address)=lower(${ownerAddress})`;
  const patternRows = await sql<{ primary_pattern: string | null; count: number }>`select primary_pattern, count(*)::int as count
    from guards
    where is_example = false and status = 'RESOLVED' and lower(owner_address)=lower(${ownerAddress})
      and primary_pattern is not null and primary_pattern <> 'NONE'
    group by primary_pattern
    order by count desc, primary_pattern asc
    limit 100`;
  const counts = {
    finalized: Number(summary?.finalized ?? 0),
    FAITHFUL_SUCCESS: Number(summary?.faithful_success ?? 0),
    PARTIAL_ALIGNMENT: Number(summary?.partial_alignment ?? 0),
    METRIC_GAMING: Number(summary?.metric_gaming ?? 0),
    INSUFFICIENT_EVIDENCE: Number(summary?.insufficient_evidence ?? 0),
  };
  const patterns: Record<string, number> = {};
  for (const row of patternRows) {
    if (row.primary_pattern) patterns[row.primary_pattern] = Number(row.count);
  }
  return { counts, patterns };
}

export async function applyChainCreate(
  id: string,
  input: { onchainId: string; txCreate: string; ownerAddress: string },
  actorAddress: string,
): Promise<Guard> {
  const g = await requireOwnedGuard(id, actorAddress);
  if (g.isExample) throw new AppError("FORBIDDEN", "Example guards cannot be mutated", 403);
  if (g.onchainId && g.onchainId !== input.onchainId) {
    throw new AppError("CONFLICT", "Guard is already bound to a different on-chain id", 409);
  }
  if (g.txCreate && g.txCreate.toLowerCase() !== input.txCreate.toLowerCase()) {
    throw new AppError("CONFLICT", "Guard is already tied to a different create transaction", 409);
  }
  const sql = await getSql();
  if (!sameWallet(input.ownerAddress, actorAddress)) {
    throw new AppError("FORBIDDEN", "On-chain owner does not match the wallet session", 403);
  }
  const updated = await sql.query<{ id: string }>(
    `update guards set onchain_id=$1, tx_create=coalesce(tx_create,$2), updated_at=now()
     where id=$3 and lower(owner_address)=lower($4)
       and (onchain_id is null or onchain_id=$1)
       and (tx_create is null or lower(tx_create)=lower($2))
     returning id`,
    [input.onchainId, input.txCreate, id, actorAddress],
  );
  if (!updated[0]) throw new AppError("CONFLICT", "Guard changed while chain creation was being indexed", 409);
  return requireGuard(id);
}

export async function recordChainCreateSubmission(
  id: string,
  input: {
    operation: "create_guard";
    txHash: string;
    originatingWallet: string;
    chainId: number;
    contractAddress: string;
    submittedAt: string;
    reservationToken?: string;
  },
  actorAddress: string,
): Promise<Guard> {
  return recordChainTransaction(id, input, actorAddress);
}

export type ChainTransaction = {
  guardId: string;
  operation: ChainOperation;
  txHash: string;
  originatingWallet: string;
  chainId: number;
  contractAddress: string;
  expectedGuardId: string | null;
  expectedEvidenceHash: string | null;
  submittedAt: string;
  reconciledAt: string | null;
};

type ChainTransactionRow = {
  guard_id: string;
  operation: string;
  tx_hash: string;
  originating_wallet: string;
  chain_id: number | string;
  contract_address: string;
  expected_guard_id: string | null;
  expected_evidence_hash: string | null;
  submitted_at: string;
  reconciled_at: string | null;
};

function mapChainTransaction(row: ChainTransactionRow): ChainTransaction {
  return {
    guardId: row.guard_id,
    operation: row.operation as ChainOperation,
    txHash: row.tx_hash,
    originatingWallet: row.originating_wallet,
    chainId: Number(row.chain_id),
    contractAddress: row.contract_address,
    expectedGuardId: row.expected_guard_id,
    expectedEvidenceHash: row.expected_evidence_hash,
    submittedAt: row.submitted_at,
    reconciledAt: row.reconciled_at,
  };
}

export async function getChainTransaction(
  guardId: string,
  operation: ChainOperation,
): Promise<ChainTransaction | null> {
  const sql = await getSql();
  const rows = await sql.query<ChainTransactionRow>(
    `select guard_id, operation, tx_hash, originating_wallet, chain_id,
            contract_address, expected_guard_id, expected_evidence_hash,
            submitted_at, reconciled_at
       from guard_transactions where guard_id=$1 and operation=$2 limit 1`,
    [guardId, operation],
  );
  if (rows[0]) return mapChainTransaction(rows[0]);
  if (operation !== "create_guard") return null;
  const intents = await sql.query<CreateIntentRow>(
    `select guard_id, 'create_guard' as operation, tx_hash,
            wallet as originating_wallet, chain_id, contract_address,
            null::text as expected_guard_id, null::text as expected_evidence_hash,
            created_at as submitted_at, reconciled_at
       from create_guard_intents
      where guard_id=$1 and tx_hash is not null limit 1`,
    [guardId],
  );
  if (!intents[0]) return null;
  return mapChainTransaction(intents[0] as unknown as ChainTransactionRow);
}

function legacyTransactionColumn(operation: ChainOperation): "tx_create" | "tx_arm" | "tx_evidence" | "tx_evaluate" | null {
  switch (operation) {
    case "create_guard": return "tx_create";
    case "arm_guard": return "tx_arm";
    case "submit_evidence": return "tx_evidence";
    case "evaluate_guard": return "tx_evaluate";
    default: return null;
  }
}

export async function recordChainTransaction(
  id: string,
  input: {
    operation: ChainOperation;
    txHash: string;
    originatingWallet: string;
    chainId: number;
    contractAddress: string;
    submittedAt: string;
    expectedGuardId?: string | null;
    expectedEvidenceHash?: string | null;
    reservationToken?: string;
  },
  actorAddress: string,
): Promise<Guard> {
  const g = await requireOwnedGuard(id, actorAddress);
  if (g.isExample) throw new AppError("FORBIDDEN", "Example guards cannot be mutated", 403);
  if (!sameWallet(input.originatingWallet, actorAddress)) {
    throw new AppError("FORBIDDEN", "Submitted wallet does not match the wallet session", 403);
  }
  const resource = resolvedDeployment(g);
  if (input.chainId !== resource.chainId) {
    throw new AppError("WRONG_NETWORK", `Transactions must target ${resource.networkName}`, 409);
  }
  if (input.contractAddress.toLowerCase() !== resource.contractAddress.toLowerCase()) {
    throw new AppError("CONTRACT_MISMATCH", "Transaction contract is not certified", 409);
  }
  if (input.expectedGuardId && g.onchainId && g.onchainId !== input.expectedGuardId) {
    throw new AppError("CONFLICT", "This transaction targets a different on-chain Guard", 409);
  }

  const txHash = input.txHash.toLowerCase();
  const existing = await getChainTransaction(id, input.operation);
  if (!existing && input.operation !== "create_guard") requireActiveWrite(resource);
  if (existing) {
    if (existing.txHash.toLowerCase() !== txHash) {
      throw new AppError("CONFLICT", "This Guard operation already has a different transaction", 409);
    }
    if (
      input.expectedEvidenceHash &&
      existing.expectedEvidenceHash &&
      existing.expectedEvidenceHash.toLowerCase() !== input.expectedEvidenceHash.toLowerCase()
    ) {
      throw new AppError("CONFLICT", "This evidence transaction has a different expected commitment", 409);
    }
    if (input.expectedEvidenceHash && !existing.expectedEvidenceHash) {
      const sql = await getSql();
      await sql.query(
        `update guard_transactions set expected_evidence_hash=$1
           where guard_id=$2 and operation=$3 and lower(tx_hash)=lower($4)
           and expected_evidence_hash is null`,
        [input.expectedEvidenceHash, id, input.operation, input.txHash],
      );
    }
    if (input.operation === "create_guard" && !g.txCreate) {
      const sql = await getSql();
      await sql.query(
        `update guards set tx_create=coalesce(tx_create,$1),
           tx_create_operation=coalesce(tx_create_operation,'create_guard'),
           tx_create_owner=coalesce(tx_create_owner,$2),
           tx_create_chain_id=coalesce(tx_create_chain_id,$3),
           tx_create_contract=coalesce(tx_create_contract,$4),
           tx_create_submitted_at=coalesce(tx_create_submitted_at,$5), updated_at=now()
         where id=$6 and lower(owner_address)=lower($7)`,
        [input.txHash, input.originatingWallet, input.chainId, input.contractAddress, input.submittedAt, id, actorAddress],
      );
    }
    return requireGuard(id);
  }
  if (input.operation === "create_guard" && g.onchainId) {
    throw new AppError("CONFLICT", "This Guard is already reconciled on Studionet", 409);
  }
  if (input.operation === "create_guard") {
    const sql = await getSql();
    const intent = await sql.query<CreateIntentRow>(
      `select guard_id, idempotency_key, wallet, version, definition_hash,
              chain_id, contract_address, claim_token, state, tx_hash, reconciled_at
         from create_guard_intents where guard_id=$1 limit 1`,
      [id],
    );
    if (intent[0]) {
      const row = intent[0];
      if (!sameWallet(row.wallet, input.originatingWallet)) {
        throw new AppError("FORBIDDEN", "Create reservation wallet does not match the submitted wallet", 403);
      }
      if (row.tx_hash && row.tx_hash.toLowerCase() !== txHash) {
        throw new AppError("CONFLICT", "This Guard create reservation already has a different transaction", 409);
      }
      if (row.claim_token !== input.reservationToken && !row.tx_hash) {
        throw new AppError("CONFLICT", "This Guard create reservation belongs to another submission", 409);
      }
      const bound = await sql.query<CreateIntentRow>(
        `update create_guard_intents set tx_hash=$1, state='SUBMITTED', updated_at=now()
           where guard_id=$2 and tx_hash is null and state <> 'RELEASED'
           returning guard_id, idempotency_key, wallet, version, definition_hash,
                     chain_id, contract_address, claim_token, state, tx_hash, reconciled_at`,
        [input.txHash, id],
      );
      if (!bound[0] && row.tx_hash?.toLowerCase() !== txHash) {
        throw new AppError("CONFLICT", "Create reservation changed while the transaction was being recorded", 409);
      }
    } else {
      await sql.query(
        `insert into create_guard_intents (
           guard_id, idempotency_key, wallet, version, definition_hash,
           chain_id, contract_address, claim_token, state, tx_hash
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,'SUBMITTED',$9)
         on conflict (guard_id) do nothing`,
        [
          id,
          `legacy:${id}:${txHash}`,
          input.originatingWallet,
          g.version,
          g.definitionHash,
          input.chainId,
          input.contractAddress,
          input.reservationToken ?? `legacy:${txHash}`,
          input.txHash,
        ],
      );
    }
  }
  const sql = await getSql();
  try {
    const inserted = await sql.query<ChainTransactionRow>(
      `insert into guard_transactions (
         guard_id, operation, tx_hash, originating_wallet, chain_id,
         contract_address, expected_guard_id, expected_evidence_hash, submitted_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (guard_id, operation) do update set tx_hash=guard_transactions.tx_hash
       where lower(guard_transactions.tx_hash)=lower(excluded.tx_hash)
       returning guard_id, operation, tx_hash, originating_wallet, chain_id,
                 contract_address, expected_guard_id, expected_evidence_hash,
                 submitted_at, reconciled_at`,
      [
        id,
        input.operation,
        input.txHash,
        input.originatingWallet,
        input.chainId,
        input.contractAddress,
        input.expectedGuardId ?? g.onchainId,
        input.expectedEvidenceHash ?? null,
        input.submittedAt,
      ],
    );
    if (!inserted[0]) throw new AppError("CONFLICT", "This Guard operation already has a different transaction", 409);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("CONFLICT", "This transaction is already recorded for another operation", 409);
  }

  const column = legacyTransactionColumn(input.operation);
  if (column) {
    const updated = await sql.query<{ id: string }>(
      `update guards set ${column}=coalesce(${column},$1),
         ${input.operation === "create_guard" ? "tx_create_operation=coalesce(tx_create_operation,$2), tx_create_owner=coalesce(tx_create_owner,$3), tx_create_chain_id=coalesce(tx_create_chain_id,$4), tx_create_contract=coalesce(tx_create_contract,$5), tx_create_submitted_at=coalesce(tx_create_submitted_at,$6)," : ""}
         updated_at=now()
       where id=$${input.operation === "create_guard" ? 7 : 2}
         and lower(owner_address)=lower($${input.operation === "create_guard" ? 8 : 3})
         and (${column} is null or lower(${column})=lower($1))
       returning id`,
      input.operation === "create_guard"
        ? [input.txHash, input.operation, input.originatingWallet, input.chainId, input.contractAddress, input.submittedAt, id, actorAddress]
        : [input.txHash, id, actorAddress],
    );
    if (!updated[0]) throw new AppError("CONFLICT", "Guard changed while the transaction was being recorded", 409);
  }
  return requireGuard(id);
}

export async function markChainTransactionReconciled(
  guardId: string,
  operation: ChainOperation,
  txHash: string,
  expectedGuardId?: string | null,
  expectedEvidenceHash?: string | null,
): Promise<void> {
  const sql = await getSql();
  const updated = await sql.query<{ guard_id: string }>(
    `update guard_transactions set reconciled_at=coalesce(reconciled_at,now()),
       expected_guard_id=coalesce(expected_guard_id,$4),
       expected_evidence_hash=coalesce($5,expected_evidence_hash)
     where guard_id=$1 and operation=$2 and lower(tx_hash)=lower($3)
     returning guard_id`,
    [guardId, operation, txHash, expectedGuardId ?? null, expectedEvidenceHash ?? null],
  );
  if (!updated[0]) {
    if (operation === "create_guard") {
      const intent = await sql.query<{ tx_hash: string }>(
        `select tx_hash from create_guard_intents where guard_id=$1 and lower(tx_hash)=lower($2) limit 1`,
        [guardId, txHash],
      );
      if (intent[0]) {
        await sql.query(
          `update create_guard_intents set state='RECONCILED', reconciled_at=coalesce(reconciled_at,now()), updated_at=now()
             where guard_id=$1 and lower(tx_hash)=lower($2)`,
          [guardId, txHash],
        );
        return;
      }
    }
    throw new AppError("CONFLICT", "Transaction provenance changed during reconciliation", 409);
  }
  if (operation === "create_guard") {
    await sql.query(
      `update create_guard_intents set state='RECONCILED', reconciled_at=coalesce(reconciled_at,now()), updated_at=now()
         where guard_id=$1 and lower(tx_hash)=lower($2)`,
      [guardId, txHash],
    );
  }
}

export async function applyChainArm(id: string, txArm: string, actorAddress: string): Promise<Guard> {
  const g = await requireOwnedGuard(id, actorAddress);
  if (g.isExample) throw new AppError("FORBIDDEN", "Example guards cannot be mutated", 403);
  if (!g.onchainId) throw new AppError("INVALID_STATE", "Guard is not on chain yet", 409);
  if (g.txArm && g.txArm.toLowerCase() !== txArm.toLowerCase()) {
    throw new AppError("CONFLICT", "Guard is already tied to a different arm transaction", 409);
  }
  const sql = await getSql();
  const updated = await sql.query<{ id: string }>(
    `update guards set status=case when status='DRAFT' then 'ARMED' else status end,
     tx_arm=coalesce(tx_arm,$1), armed_at=coalesce(armed_at,now()), updated_at=now()
     where id=$2 and lower(owner_address)=lower($3)
       and (tx_arm is null or lower(tx_arm)=lower($1)) returning id`,
    [txArm, id, actorAddress],
  );
  if (!updated[0]) throw new AppError("CONFLICT", "Guard changed while chain arming was being indexed", 409);
  return requireGuard(id);
}

export async function applyChainEvidence(
  id: string,
  input: { txEvidence: string; evidenceJson: string; evidenceHash: string },
  actorAddress: string,
): Promise<Guard> {
  const g = await requireOwnedGuard(id, actorAddress);
  if (g.isExample) throw new AppError("FORBIDDEN", "Example guards cannot be mutated", 403);
  if (g.evidenceHash && g.evidenceHash !== input.evidenceHash) {
    throw new AppError("CONFLICT", "Evidence commitment does not match the stored commitment", 409);
  }
  if (g.txEvidence && g.txEvidence.toLowerCase() !== input.txEvidence.toLowerCase()) {
    throw new AppError("CONFLICT", "Guard is already tied to a different evidence transaction", 409);
  }
  const sql = await getSql();
  const updated = await sql.query<{ id: string }>(
    `update guards set evidence_json=case when evidence_hash='' then $1 else evidence_json end,
     evidence_hash=case when evidence_hash='' then $2 else evidence_hash end,
     status=case when status in ('ARMED','DRAFT') then 'EVIDENCE_SUBMITTED' else status end,
     tx_evidence=coalesce(tx_evidence,$3), evidence_at=coalesce(evidence_at,now()), updated_at=now()
     where id=$4 and lower(owner_address)=lower($5)
       and (tx_evidence is null or lower(tx_evidence)=lower($3)) returning id`,
    [input.evidenceJson, input.evidenceHash, input.txEvidence, id, actorAddress],
  );
  if (!updated[0]) throw new AppError("CONFLICT", "Guard changed while chain evidence was being indexed", 409);
  return requireGuard(id);
}

export async function applyChainEvaluate(
  id: string,
  input: {
    txEvaluate: string;
    findings: Findings;
    verdict: Verdict;
    pattern: GamingPattern;
  },
  actorAddress: string,
): Promise<Guard> {
  const g = await requireOwnedGuard(id, actorAddress);
  if (g.isExample) throw new AppError("FORBIDDEN", "Example guards cannot be mutated", 403);
  if (g.authority === "GENLAYER" && g.status === "RESOLVED") {
    if (g.txEvaluate?.toLowerCase() === input.txEvaluate.toLowerCase()) {
      await createReceipt(g);
      return g;
    }
    throw new AppError("LOCKED", "Finalized GenLayer verdict cannot be overwritten", 409);
  }
  if (g.status !== "EVIDENCE_SUBMITTED" && g.status !== "RESOLVED") {
    throw new AppError("INVALID_STATE", "Chain evaluation requires submitted evidence", 409);
  }
  const sql = await getSql();
  const updated = await sql.query<{ id: string }>(
    `update guards set findings_json=$1, verdict=$2, primary_pattern=$3,
     status='RESOLVED', resolved_at=now(), updated_at=now(), authority='GENLAYER',
     tx_evaluate=coalesce(tx_evaluate,$4) where id=$5
       and status in ('EVIDENCE_SUBMITTED','RESOLVED')
       and (tx_evaluate is null or lower(tx_evaluate)=lower($4))
       and lower(owner_address)=lower($6) returning id`,
    [
      JSON.stringify(input.findings),
      input.verdict,
      input.pattern,
      input.txEvaluate,
      id,
      actorAddress,
    ],
  );
  if (!updated[0]) {
    const current = await requireGuard(id);
    if (current.authority === "GENLAYER" && current.txEvaluate?.toLowerCase() === input.txEvaluate.toLowerCase()) return current;
    throw new AppError("CONFLICT", "Guard changed while chain evaluation was being indexed", 409);
  }
  const resolved = await requireGuard(id);
  await createReceipt(resolved);
  return resolved;
}
