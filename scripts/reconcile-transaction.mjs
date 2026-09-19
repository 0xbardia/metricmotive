#!/usr/bin/env node
/**
 * Safe operator recovery for one already-submitted GenLayer write.
 *
 * This command only reads the transaction/contract and updates the local
 * projection. It has no wallet, signer, or contract-write capability.
 */
import pg from "pg";
import { guardDeployment } from "../src/lib/contract.ts";
import { getReadClientForProvenance } from "../src/lib/server/chain-client.ts";
import { GENLAYER, mapVerdict, parseGuardrails } from "../src/lib/domain.ts";
import { buildEvidenceManifest, evidenceCommitmentHash, evidenceManifestPreimage, replayEvidenceSnapshot } from "../src/lib/evidence.ts";
import { newId } from "../src/lib/ids.ts";
import { findingsSchema, chainGuardSchema, parseEvidence } from "../src/lib/validation.ts";
import {
  CHAIN_OPERATIONS,
  decodeEvidenceTransaction,
  verifyChainGuard,
  verifyTransaction,
} from "../src/lib/reconciliation.ts";

const [guardId, operation, txHash] = process.argv.slice(2);
if (!guardId || !CHAIN_OPERATIONS.includes(operation) || !txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
  console.error("usage: node --experimental-strip-types scripts/reconcile-transaction.mjs <local-guard-id> <operation> <tx-hash>");
  process.exit(2);
}
if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is required for production recovery");
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const normalizedHash = txHash.toLowerCase();
let deployment;

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item));
}

function isoDate(value) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function localDefinition(row) {
  return {
    ownerAddress: row.owner_address,
    motive: row.motive,
    metric: row.metric,
    guardrails: parseGuardrails(row.guardrails_json || "[]"),
    definitionHash: row.definition_hash,
  };
}

function legacyColumn(name) {
  return {
    create_guard: "tx_create",
    arm_guard: "tx_arm",
    submit_evidence: "tx_evidence",
    evaluate_guard: "tx_evaluate",
  }[name] ?? null;
}

async function ensureProvenance(row) {
  const existing = await pool.query(
    "select tx_hash, chain_id, contract_address from guard_transactions where guard_id=$1 and operation=$2 limit 1",
    [guardId, operation],
  );
  if (existing.rows[0] && existing.rows[0].tx_hash.toLowerCase() !== normalizedHash) {
    throw new Error("This operation already has a different transaction; refusing to overwrite it");
  }
  if (!existing.rows[0]) {
    if (!row.contract_address && !row.tx_create_contract) throw new Error("Missing persisted Guard deployment; refusing recovery");
    const inserted = await pool.query(
      `insert into guard_transactions (
         guard_id, operation, tx_hash, originating_wallet, chain_id,
         contract_address, expected_guard_id, submitted_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (guard_id, operation) do nothing
       returning guard_id`,
      [guardId, operation, txHash, row.owner_address, deployment.chainId, deployment.contractAddress, row.onchain_id, new Date().toISOString()],
    );
    if (!inserted.rows[0]) throw new Error("Transaction provenance changed during recovery");
  }
  const column = legacyColumn(operation);
  if (existing.rows[0] && (Number(existing.rows[0].chain_id) !== deployment.chainId || existing.rows[0].contract_address.toLowerCase() !== deployment.contractAddress.toLowerCase())) {
    throw new Error("Operation deployment does not match this Guard");
  }
  if (!column) return;
  const values = operation === "create_guard"
    ? [txHash, operation, row.owner_address, deployment.chainId, deployment.contractAddress, new Date().toISOString(), guardId]
    : [txHash, guardId];
  const query = operation === "create_guard"
    ? `update guards set tx_create=coalesce(tx_create,$1), tx_create_operation=coalesce(tx_create_operation,$2),
          tx_create_owner=coalesce(tx_create_owner,$3), tx_create_chain_id=coalesce(tx_create_chain_id,$4),
          tx_create_contract=coalesce(tx_create_contract,$5), tx_create_submitted_at=coalesce(tx_create_submitted_at,$6), updated_at=now()
        where id=$7 and (tx_create is null or lower(tx_create)=lower($1))`
    : `update guards set ${column}=coalesce(${column},$1), updated_at=now()
        where id=$2 and (${column} is null or lower(${column})=lower($1))`;
  const updated = await pool.query(query, values);
  if (updated.rowCount !== 1) throw new Error("Local Guard changed during recovery");
}

async function readChain(client, onchainId) {
  const raw = await client.readContract({
    address: deployment.contractAddress,
    functionName: "get_guard",
    args: [Number(onchainId)],
  });
  const parsed = chainGuardSchema.safeParse(jsonSafe(raw));
  if (!parsed.success || !parsed.data.found) throw new Error("Guard was not found on Studionet");
  return parsed.data;
}

async function markReconciled(onchainId) {
  const result = await pool.query(
    `update guard_transactions set reconciled_at=coalesce(reconciled_at,now()), expected_guard_id=coalesce(expected_guard_id,$4)
       where guard_id=$1 and operation=$2 and lower(tx_hash)=lower($3) returning guard_id`,
    [guardId, operation, txHash, onchainId],
  );
  if (result.rowCount !== 1) throw new Error("Transaction provenance changed during recovery");
  if (operation === "create_guard") {
    await pool.query(
      `update create_guard_intents
          set state='RECONCILED', reconciled_at=coalesce(reconciled_at,now()), updated_at=now()
        where guard_id=$1 and lower(tx_hash)=lower($2)`,
      [guardId, txHash],
    );
  }
}

async function upsertReceipt(row, chain, findings, verdict, pattern) {
  const snapshot = {
    motive: row.motive,
    metric: row.metric,
    version: Number(row.version),
    status: "RESOLVED",
    evidenceHash: chain.evidence_hash,
    verdict,
    primaryPattern: pattern,
    authority: "GENLAYER",
    definitionHash: row.definition_hash,
    network: GENLAYER.network,
    advisory: false,
    example: false,
    resolvedAt: chain.resolved_at || new Date().toISOString(),
    contractAddress: deployment.contractAddress,
    onchainId: String(chain.id),
    chainId: deployment.chainId,
    txEvaluate: txHash,
    txCreate: row.tx_create || undefined,
    txArm: row.tx_arm || undefined,
    txEvidence: row.tx_evidence || undefined,
  };
  const existing = await pool.query("select id from receipts where guard_id=$1 limit 1", [guardId]);
  if (existing.rows[0]) {
    await pool.query("update receipts set snapshot_json=$1, is_example=false where id=$2", [JSON.stringify(snapshot), existing.rows[0].id]);
    return existing.rows[0].id;
  }
  const id = newId("rct");
  await pool.query(
    "insert into receipts (id, guard_id, is_example, snapshot_json) values ($1,$2,false,$3)",
    [id, guardId, JSON.stringify(snapshot)],
  );
  return id;
}

try {
  const found = await pool.query("select * from guards where id=$1 limit 1", [guardId]);
  const row = found.rows[0];
  if (!row) throw new Error("Local Guard was not found");
  deployment = guardDeployment({ contractAddress: row.contract_address, chainId: row.chain_id, txCreateContract: row.tx_create_contract, txCreateChainId: row.tx_create_chain_id, onchainId: row.onchain_id, txCreate: row.tx_create });
  if (row.is_example) throw new Error("Example Guards cannot be recovered");
  await ensureProvenance(row);

  const local = localDefinition(row);
  const { client } = getReadClientForProvenance({
    chainId: deployment.chainId,
    contractAddress: deployment.contractAddress,
  });
  const transaction = await client.getTransaction({ hash: txHash });
  let expectedEvidenceHash = null;
  if (operation === "submit_evidence") {
    if (!row.onchain_id) throw new Error("Evidence recovery requires a bound on-chain Guard");
    const payload = decodeEvidenceTransaction(transaction, {
      operation,
      txHash,
      ownerAddress: row.owner_address,
      contractAddress: deployment.contractAddress,
      chainId: deployment.chainId,
      onchainId: row.onchain_id,
    });
    let submittedManifest;
    try {
      submittedManifest = parseEvidence(payload.manifest);
    } catch {
      throw new Error("The submitted evidence manifest is invalid");
    }
    const runResult = await pool.query(
      `select id, guard_id, agent_ref, status, events_json, outcome_json, started_at, completed_at,
              evidence_snapshot_json
         from runs where id=$1 limit 1`,
      [submittedManifest.runId],
    );
    const runRow = runResult.rows[0];
    if (!runRow || runRow.guard_id !== guardId || runRow.status !== "FINISHED") {
      throw new Error("The submitted evidence does not belong to a finished Run for this Guard");
    }
    if (submittedManifest.guardId !== row.onchain_id) {
      throw new Error("The submitted evidence targets a different on-chain Guard");
    }

    // 1. A Run finished after snapshots shipped replays its pinned bytes.
    if (runRow.evidence_snapshot_json) {
      const snapshot = await replayEvidenceSnapshot(runRow.evidence_snapshot_json);
      if (evidenceManifestPreimage(submittedManifest) !== evidenceManifestPreimage(snapshot.manifest)) {
        throw new Error("The submitted evidence does not match the persisted Run snapshot");
      }
      expectedEvidenceHash = snapshot.commitmentHash;
    } else {
      // 2. Pre-snapshot Run: prove the on-chain submission is canonically
      //    equivalent to the persisted Run, then pin those exact submitted
      //    bytes. The transaction is the submission of record, so pinning it
      //    is a recovery, never a fabrication — a mismatch fails closed.
      const rebuilt = await buildEvidenceManifest({
        guardId: row.onchain_id,
        run: {
          id: runRow.id,
          agentRef: runRow.agent_ref,
          startedAt: isoDate(runRow.started_at),
          completedAt: runRow.completed_at == null ? null : isoDate(runRow.completed_at),
          events: JSON.parse(runRow.events_json),
          outcome: JSON.parse(runRow.outcome_json),
        },
      });
      if (evidenceManifestPreimage(submittedManifest) !== evidenceManifestPreimage(rebuilt)) {
        throw new Error("The submitted evidence does not match the persisted Run snapshot");
      }
      const encoded = JSON.stringify(submittedManifest);
      await pool.query(
        `update runs set evidence_snapshot_json=$1, evidence_manifest_hash=$2, evidence_commitment_hash=$3,
           evidence_committed_at=coalesce(evidence_committed_at, now())
         where id=$4 and evidence_snapshot_json is null`,
        [encoded, submittedManifest.manifestHash, await evidenceCommitmentHash(submittedManifest), runRow.id],
      );
      expectedEvidenceHash = await evidenceCommitmentHash(submittedManifest);
    }
  }
  const decoded = await verifyTransaction(transaction, {
    operation,
    txHash,
    ownerAddress: row.owner_address,
    contractAddress: deployment.contractAddress,
    chainId: deployment.chainId,
    onchainId: operation === "create_guard" ? null : row.onchain_id,
    ...local,
    evidenceHash: expectedEvidenceHash,
  });
  if (decoded.state === "pending") {
    console.log(JSON.stringify({ guardId, operation, txHash, state: decoded.state, status: decoded.status }, null, 2));
    process.exit(0);
  }

  const onchainId = decoded.onchainId || row.onchain_id;
  if (!onchainId) throw new Error("Finalized transaction did not identify a Guard");
  const chain = await readChain(client, onchainId);
  await verifyChainGuard(chain, local, onchainId, operation === "create_guard" ? ["DRAFT", "ARMED", "EVIDENCE_SUBMITTED", "RESOLVED"] : operation === "evaluate_guard" ? ["RESOLVED"] : operation === "arm_guard" ? ["ARMED", "EVIDENCE_SUBMITTED", "RESOLVED"] : operation === "submit_evidence" ? ["EVIDENCE_SUBMITTED", "RESOLVED"] : ["DRAFT"]);

  if (operation === "create_guard") {
    await pool.query(
      `update guards set onchain_id=$1, tx_create=coalesce(tx_create,$2), updated_at=now()
         where id=$3 and (onchain_id is null or onchain_id=$1) and (tx_create is null or lower(tx_create)=lower($2))`,
      [onchainId, txHash, guardId],
    );
  } else if (operation === "arm_guard") {
    await pool.query(
      `update guards set status=case when status='DRAFT' then 'ARMED' else status end,
         tx_arm=coalesce(tx_arm,$1), armed_at=coalesce(armed_at,now()), updated_at=now()
       where id=$2 and (tx_arm is null or lower(tx_arm)=lower($1))`,
      [txHash, guardId],
    );
  } else if (operation === "submit_evidence") {
    if (expectedEvidenceHash && chain.evidence_hash !== expectedEvidenceHash) {
      throw new Error("The authoritative evidence commitment does not match the submitted manifest");
    }
    await pool.query(
      `update guard_transactions set expected_evidence_hash=$1
         where guard_id=$2 and operation=$3 and lower(tx_hash)=lower($4)
           and (expected_evidence_hash is null or expected_evidence_hash <> $1)`,
      [expectedEvidenceHash, guardId, operation, txHash],
    );
    await pool.query(
      `update guards set evidence_json=case when evidence_hash='' then $1 else evidence_json end,
         evidence_hash=case when evidence_hash='' then $2 else evidence_hash end,
         status=case when status in ('ARMED','DRAFT') then 'EVIDENCE_SUBMITTED' else status end,
         tx_evidence=coalesce(tx_evidence,$3), evidence_at=coalesce(evidence_at,now()), updated_at=now()
       where id=$4 and (tx_evidence is null or lower(tx_evidence)=lower($3))`,
      [chain.evidence_json, chain.evidence_hash, txHash, guardId],
    );
  } else if (operation === "evaluate_guard") {
    const findingsParsed = findingsSchema.safeParse(JSON.parse(chain.findings_json || ""));
    if (!findingsParsed.success) throw new Error("Studionet returned invalid semantic findings");
    const findings = findingsParsed.data;
    const verdict = String(chain.verdict);
    if (!mapVerdict(findings) || mapVerdict(findings) !== verdict) throw new Error("On-chain verdict does not match deterministic findings mapping");
    const pattern = String(chain.primary_pattern || findings.primary_pattern);
    if (pattern !== findings.primary_pattern) throw new Error("On-chain primary pattern does not match findings");
    await pool.query(
      `update guards set findings_json=$1, verdict=$2, primary_pattern=$3, status='RESOLVED',
         resolved_at=coalesce(resolved_at,now()), updated_at=now(), authority='GENLAYER', tx_evaluate=coalesce(tx_evaluate,$4)
       where id=$5 and status in ('EVIDENCE_SUBMITTED','RESOLVED')
         and (tx_evaluate is null or lower(tx_evaluate)=lower($4))`,
      [JSON.stringify(findings), verdict, pattern, txHash, guardId],
    );
    await upsertReceipt(row, chain, findings, verdict, pattern);
  }
  await markReconciled(onchainId);
  console.log(JSON.stringify({ guardId, operation, txHash, onchainId, network: GENLAYER.network, status: chain.status, verdict: chain.verdict || null }, null, 2));
} finally {
  await pool.end();
}
