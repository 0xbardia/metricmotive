import { guardDeployment } from "@/lib/contract";
import { getReadClientForProvenance, transactionIdentity } from "./chain-client";
import {
  CONFIRMATION_UNAVAILABLE_MESSAGE,
  CHAIN_OPERATIONS,
  decodeEvidenceTransaction,
  isTemporaryChainError,
  ReconciliationError,
  type ChainOperation,
  type TransactionVerification,
  verifyChainGuard,
  verifyTransaction,
} from "@/lib/reconciliation";
import { mapVerdict, type Findings, type Guard, type Verdict } from "@/lib/domain";
import { AppError } from "@/lib/errors";
import { parseEvidence } from "@/lib/validation";
import {
  applyChainArm,
  applyChainCreate,
  applyChainEvaluate,
  applyChainEvidence,
  getChainTransaction,
  getGuard,
  markChainTransactionReconciled,
  recordChainTransaction,
  requireOwnedGuard,
  requireOwnedRun,
  resolveRunEvidenceSnapshot,
  type ChainTransaction,
} from "./repo";
import { asPattern, asStatus, asVerdict, parseFindings, readChainGuard } from "./chain-read";
import { sameWallet } from "./security";

export type TransactionReconciliation = {
  state: "pending" | "unavailable" | "mismatch" | "reconciled";
  operation: ChainOperation;
  guard: Guard;
  txHash: string;
  status?: string;
  onchainId?: string;
  findings?: Findings;
  verdict?: Verdict;
  message?: string;
  retryable?: boolean;
};

export type CreateReconciliation = TransactionReconciliation & {
  operation: "create_guard";
};

const MAX_RPC_WAIT_MS = 12_000;
type FinalizedTransaction = Extract<TransactionVerification, { state: "finalized" }>;
const inFlightKey = Symbol.for("metricmotive.transaction-reconciliation");
const globalRef = globalThis as typeof globalThis & {
  [inFlightKey]?: Map<string, Promise<TransactionReconciliation>>;
};
const inFlight =
  globalRef[inFlightKey] ??
  (globalRef[inFlightKey] = new Map());
// ponytail: process-local dedupe is enough for this single preview worker; use
// a shared lock only if reconciliation ever runs across multiple app instances.

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chain confirmation timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function mismatch(message: string): ReconciliationError {
  return new ReconciliationError("MISMATCH", message);
}

function legacyTransaction(local: Guard, operation: ChainOperation): ChainTransaction | null {
  const txHash = operation === "create_guard"
    ? local.txCreate
    : operation === "arm_guard"
      ? local.txArm
      : operation === "submit_evidence"
        ? local.txEvidence
        : operation === "evaluate_guard"
          ? local.txEvaluate
          : null;
  if (!txHash) return null;
  return {
    guardId: local.id,
    operation,
    txHash,
    originatingWallet: local.txCreateOwner ?? local.ownerAddress,
    chainId: guardDeployment(local).chainId,
    contractAddress: guardDeployment(local).contractAddress,
    expectedGuardId: local.onchainId,
    expectedEvidenceHash: operation === "submit_evidence" ? local.evidenceHash : null,
    submittedAt: local.txCreateSubmittedAt ?? local.updatedAt,
    reconciledAt: null,
  };
}

function allowedStatuses(operation: ChainOperation): string[] {
  switch (operation) {
    case "create_guard":
    case "update_draft":
      return ["DRAFT"];
    case "arm_guard":
      return ["ARMED", "EVIDENCE_SUBMITTED", "RESOLVED"];
    case "submit_evidence":
      return ["EVIDENCE_SUBMITTED", "RESOLVED"];
    case "evaluate_guard":
      return ["RESOLVED"];
    case "create_version":
      return ["DRAFT"];
  }
}

async function verifyChainDefinition(local: Guard, onchainId: string, ownerAddress: string, operation: ChainOperation) {
  let chain: Awaited<ReturnType<typeof readChainGuard>>;
  try {
    const deployment = guardDeployment(local);
    chain = await readChainGuard(onchainId, deployment.contractAddress, deployment.chainId);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      throw mismatch("The finalized transaction returned a Guard that does not exist on the recorded deployment.");
    }
    throw error;
  }
  const expected = { ...local, ownerAddress };
  await verifyChainGuard(
    chain,
    expected,
    onchainId,
    operation === "create_guard"
      ? ["DRAFT", "ARMED", "EVIDENCE_SUBMITTED", "RESOLVED"]
      : allowedStatuses(operation),
  );
  return chain;
}

async function applyReconciled(
  local: Guard,
  transaction: ChainTransaction,
  decoded: FinalizedTransaction,
  actorAddress: string,
): Promise<TransactionReconciliation> {
  const onchainId = decoded.onchainId ?? transaction.expectedGuardId ?? local.onchainId;
  if (!onchainId) {
    throw new ReconciliationError("MALFORMED", "The finalized transaction has no on-chain Guard ID.");
  }
  const chain = await verifyChainDefinition(local, onchainId, transaction.originatingWallet, transaction.operation);
  let guard = local;
  let findings: Findings | undefined;
  let verdict: Verdict | undefined;

  switch (transaction.operation) {
    case "create_guard":
      if (!decoded.onchainId) throw new ReconciliationError("MALFORMED", "The finalized create transaction returned no Guard ID.");
      guard = await applyChainCreate(local.id, {
        onchainId: decoded.onchainId,
        txCreate: transaction.txHash,
        ownerAddress: chain.owner,
      }, actorAddress);
      break;
    case "arm_guard":
      if (asStatus(chain.status) === "DRAFT") throw mismatch("The recorded network has not confirmed ARMED for this Guard.");
      guard = await applyChainArm(local.id, transaction.txHash, actorAddress);
      break;
    case "submit_evidence":
      if (!chain.evidence_hash) throw mismatch("The recorded network has not confirmed an evidence commitment.");
      if (transaction.expectedEvidenceHash && transaction.expectedEvidenceHash !== chain.evidence_hash) {
        throw mismatch("The committed evidence hash does not match this transaction.");
      }
      guard = await applyChainEvidence(local.id, {
        txEvidence: transaction.txHash,
        evidenceJson: chain.evidence_json,
        evidenceHash: chain.evidence_hash,
      }, actorAddress);
      break;
    case "evaluate_guard": {
      if (asStatus(chain.status) !== "RESOLVED") throw mismatch("The recorded network has not finalized a verdict for this Guard.");
      findings = parseFindings(chain.findings_json) ?? undefined;
      if (!findings) throw new ReconciliationError("MALFORMED", "Studionet returned no valid semantic findings.");
      verdict = asVerdict(chain.verdict);
      if (mapVerdict(findings) !== verdict) {
        throw mismatch("The on-chain verdict does not match the deterministic findings mapping.");
      }
      const pattern = asPattern(chain.primary_pattern || findings.primary_pattern);
      if (pattern !== findings.primary_pattern) {
        throw mismatch("The on-chain primary pattern does not match the semantic findings.");
      }
      guard = await applyChainEvaluate(local.id, {
        txEvaluate: transaction.txHash,
        findings,
        verdict,
        pattern,
      }, actorAddress);
      break;
    }
    case "update_draft":
    case "create_version":
      // These operations are not currently submitted by the V1 UI. Their
      // definition was verified above; marking the write reconciled is enough
      // until a versioned local projection is added.
      break;
  }
  await markChainTransactionReconciled(
    local.id,
    transaction.operation,
    transaction.txHash,
    onchainId,
    transaction.operation === "submit_evidence" ? transaction.expectedEvidenceHash : null,
  );
  return {
    state: "reconciled",
    operation: transaction.operation,
    guard,
    txHash: transaction.txHash,
    status: chain.status,
    onchainId,
    findings,
    verdict,
    message: "Transaction finalized. Guard reconciled on the recorded deployment.",
  };
}

async function runReconciliation(
  local: Guard,
  transaction: ChainTransaction,
  actorAddress: string,
): Promise<TransactionReconciliation> {
  if (transaction.chainId !== guardDeployment(local).chainId) throw mismatch("The stored transaction belongs to a different chain.");
  if (transaction.contractAddress.toLowerCase() !== guardDeployment(local).contractAddress.toLowerCase()) {
    throw mismatch("The stored transaction targets a different contract.");
  }
  if (!sameWallet(transaction.originatingWallet, actorAddress)) {
    throw mismatch("The stored transaction wallet does not match the wallet session.");
  }
  if (transaction.operation === "create_guard" && local.onchainId && transaction.expectedGuardId !== local.onchainId) {
    throw mismatch("The stored create transaction is bound to a different on-chain Guard.");
  }
  if (transaction.operation !== "create_guard" && transaction.expectedGuardId && transaction.expectedGuardId !== local.onchainId) {
    throw mismatch("The stored transaction targets a different on-chain Guard.");
  }

  const { client } = getReadClientForProvenance({
    chainId: transaction.chainId,
    contractAddress: transaction.contractAddress,
  });
  const raw = await withTimeout(
    client.getTransaction({ hash: transaction.txHash as never }),
    MAX_RPC_WAIT_MS,
  );
  let verifiedTransaction = transaction;
  if (transaction.operation === "submit_evidence") {
    const expectedOnchainId = transaction.expectedGuardId ?? local.onchainId;
    if (!expectedOnchainId) throw mismatch("The evidence transaction has no expected on-chain Guard.");
    const payload = decodeEvidenceTransaction(raw, {
      operation: transaction.operation,
      txHash: transaction.txHash,
      ownerAddress: transaction.originatingWallet,
      contractAddress: transaction.contractAddress,
      chainId: transaction.chainId,
      onchainId: expectedOnchainId,
    });
    let submittedManifest;
    try {
      submittedManifest = parseEvidence(payload.manifest);
    } catch {
      throw new ReconciliationError("MALFORMED", "The submitted evidence manifest is invalid.");
    }
    const run = await requireOwnedRun(submittedManifest.runId, actorAddress);
    if (run.guardId !== local.id) throw mismatch("The submitted evidence belongs to a different Guard Run.");
    if (submittedManifest.guardId !== expectedOnchainId) {
      throw mismatch("The submitted evidence targets a different on-chain Guard.");
    }
    // Compare against the snapshot pinned at Finish Run — the exact bytes the
    // wallet submitted. Rebuilding from Run columns is what produced the
    // phantom mismatch (mutable timestamps, mutable event order).
    const snapshot = await resolveRunEvidenceSnapshot(run, submittedManifest);
    // The pinned snapshot IS the submission of record: `resolveRunEvidenceSnapshot`
    // has just proven it is canonically identical to the on-chain argument, so
    // its commitment is the authoritative expectation. A `guard_transactions`
    // row written before the serializer was fixed holds a digest derived from a
    // Date-corrupted rebuild; it is a local cache, and it is corrected here to
    // the proven value. A genuinely different manifest still fails the preimage
    // check above, and a contract that stored something else still fails the
    // `chain.evidence_hash` comparison in applyReconciled.
    verifiedTransaction = {
      ...transaction,
      expectedEvidenceHash: snapshot.commitmentHash,
    };
  }
  const decoded = await verifyTransaction(raw, {
    operation: verifiedTransaction.operation,
    txHash: verifiedTransaction.txHash,
    ownerAddress: verifiedTransaction.originatingWallet,
    contractAddress: verifiedTransaction.contractAddress,
    chainId: verifiedTransaction.chainId,
    onchainId: verifiedTransaction.operation === "create_guard" ? null : (verifiedTransaction.expectedGuardId ?? local.onchainId),
    motive: local.motive,
    metric: local.metric,
    guardrails: local.guardrails,
    definitionHash: local.definitionHash,
    evidenceHash: verifiedTransaction.expectedEvidenceHash,
  });
  if (decoded.state === "pending") {
    return {
      state: "pending",
      operation: transaction.operation,
      guard: local,
      txHash: transaction.txHash,
      status: decoded.status,
      message: "Transaction submitted. Waiting for finalization on the recorded network.",
    };
  }
  return applyReconciled(local, verifiedTransaction, decoded, actorAddress);
}

async function recoverTransactionRecord(
  local: Guard,
  operation: ChainOperation,
  actorAddress: string,
  recovery?: { txHash?: string; reservationToken?: string },
): Promise<ChainTransaction | null> {
  const recorded = await getChainTransaction(local.id, operation);
  const legacy = recorded ? null : legacyTransaction(local, operation);
  const known = recorded ?? legacy;
  const submittedHash = recovery?.txHash;

  if (known && submittedHash && known.txHash.toLowerCase() !== submittedHash.toLowerCase()) {
    throw mismatch("The submitted recovery hash does not match the recorded operation.");
  }
  if (recorded) return recorded;

  const txHash = submittedHash ?? legacy?.txHash;
  if (!txHash) return null;

  const deployment = guardDeployment(local);
  await recordChainTransaction(local.id, {
    operation,
    txHash,
    originatingWallet: legacy?.originatingWallet ?? actorAddress,
    chainId: deployment.chainId,
    contractAddress: deployment.contractAddress,
    expectedGuardId: local.onchainId,
    expectedEvidenceHash: operation === "submit_evidence" ? local.evidenceHash || null : null,
    submittedAt: legacy?.submittedAt ?? local.updatedAt,
    reservationToken: recovery?.reservationToken,
  }, actorAddress);

  return (await getChainTransaction(local.id, operation)) ?? legacyTransaction(local, operation);
}

export async function reconcileTransaction(
  id: string,
  operation: ChainOperation,
  actorAddress: string,
  recovery?: { txHash?: string; reservationToken?: string },
): Promise<TransactionReconciliation> {
  if (!CHAIN_OPERATIONS.includes(operation)) {
    throw new AppError("VALIDATION", "Unsupported chain operation", 400);
  }
  const local = await requireOwnedGuard(id, actorAddress);
  const transaction = await recoverTransactionRecord(local, operation, actorAddress, recovery);
  if (!transaction) throw new AppError("INVALID_STATE", `This Guard has no submitted ${operation} transaction`, 409);
  const deployment = guardDeployment(local);
  if (transaction.chainId !== deployment.chainId || transaction.contractAddress.toLowerCase() !== deployment.contractAddress.toLowerCase()) {
    throw mismatch("The stored operation does not belong to this Guard deployment.");
  }
  if (transaction.reconciledAt && local.status === "RESOLVED" && operation === "evaluate_guard") {
    return {
      state: "reconciled",
      operation,
      guard: local,
      txHash: transaction.txHash,
      onchainId: local.onchainId ?? transaction.expectedGuardId ?? undefined,
      status: local.status,
      findings: local.findings ?? undefined,
      verdict: local.verdict ?? undefined,
      message: "Transaction is already reconciled on the recorded deployment.",
    };
  }
  const key = `${transactionIdentity({
    chainId: transaction.chainId,
    contractAddress: transaction.contractAddress,
    txHash: transaction.txHash,
  })}:${id}:${operation}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const task = runReconciliation(local, transaction, actorAddress).catch(async (error: unknown) => {
    const current = (await getGuard(local.id)) ?? local;
    if (error instanceof ReconciliationError) {
      return {
        state: "mismatch",
        operation,
        guard: current,
        txHash: transaction.txHash,
        onchainId: current.onchainId ?? transaction.expectedGuardId ?? undefined,
        message: error.message,
      } satisfies TransactionReconciliation;
    }
    if (isTemporaryChainError(error)) {
      const providerMessage = error instanceof Error ? error.message : String(error);
      return {
        state: "unavailable",
        operation,
        guard: current,
        txHash: transaction.txHash,
        onchainId: current.onchainId ?? transaction.expectedGuardId ?? undefined,
        message: CONFIRMATION_UNAVAILABLE_MESSAGE,
        retryable: !/rate limit|too many requests|\b429\b/i.test(providerMessage),
      } satisfies TransactionReconciliation;
    }
    throw error;
  });
  inFlight.set(key, task);
  void task.then(
    () => {
      if (inFlight.get(key) === task) inFlight.delete(key);
    },
    () => {
      if (inFlight.get(key) === task) inFlight.delete(key);
    },
  );
  return task;
}

export async function reconcileCreateGuard(id: string, actorAddress: string): Promise<CreateReconciliation> {
  return reconcileTransaction(id, "create_guard", actorAddress) as Promise<CreateReconciliation>;
}
