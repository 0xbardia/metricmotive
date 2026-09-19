import { createServerFn } from "@tanstack/react-start";
import {
  type EvidenceManifest,
  type Guardrail,
  definitionHash,
  mapVerdict,
  parseGuardrails,
  validateMotiveMetric,
} from "@/lib/domain";
import { idempotent } from "./idempotency";
import { AppError } from "@/lib/errors";
import { DEPLOYMENT, getActiveDeployment, guardDeployment, requireActiveWrite, resolvedDeployment } from "@/lib/contract";
import { getReadClientForDeployment } from "./chain-client";
import {
  analytics,
  appendRunEvent,
  armLocal,
  attachEvidence,
  findGuardVersion,
  finishRun,
  getGuard,
  getReceipt,
  insertGuard,
  insertRun,
  listGuards,
  listRuns,
  receiptForGuard,
  recordChainTransaction,
  recordActionAudit,
  releaseCreateGuard,
  reserveCreateGuard,
  requireGuard,
  requireOwnedGuard,
  requireOwnedRun,
  requireRun,
  ensureRunEvidenceSnapshot,
  resolveLocal,
  saveAdvisory,
  updateDraft,
  isPublicGuard,
} from "./repo";
import { reconcileTransaction } from "./chain-reconciliation";
import { CONFIRMATION_UNAVAILABLE_MESSAGE, type ChainOperation } from "@/lib/reconciliation";
import { sameWallet, normalizeWalletAddress } from "./security";
import { getWalletSession, requireWalletAddress } from "./wallet-auth.server";
import {
  addGuardrailRequestSchema,
  actionAuditRequestSchema,
  createReservationRequestSchema,
  confirmCreateRequestSchema,
  recordCreateSubmissionRequestSchema,
  confirmEvidenceRequestSchema,
  confirmTxRequestSchema,
  recordTransactionRequestSchema,
  reconcileTransactionRequestSchema,
  createV2RequestSchema,
  guardRunRequestSchema,
  idRequestSchema,
  onchainIdRequestSchema,
  ownerRequestSchema,
  parseDraftInput,
  parseInput,
  parseOutcome,
  parseRunEvent,
  parseEvidence,
  runCreateSchema,
  runIdRequestSchema,
  runEventRequestSchema,
  runOutcomeRequestSchema,
  updateDraftRequestSchema,
} from "@/lib/validation";
import {
  asStatus,
  chainReadClient,
  readChainGuard,
  readOnChain,
} from "./chain-read";
import {
  adjudicateLocal,
  evidenceBlueprint,
  loopholeScan,
  motiveDrift,
  preflight,
  remediation,
} from "./ai";

type DraftInput = {
  motive: string;
  metric: string;
  guardrails: Guardrail[];
  parentId?: string | null;
};

function parseDraft(input: DraftInput) {
  const parsed = parseDraftInput({
    motive: input.motive,
    metric: input.metric,
    guardrails: input.guardrails ?? [],
    parentId: input.parentId ?? null,
  });
  const { motive, metric } = validateMotiveMetric(parsed.motive, parsed.metric);
  const guardrails = parseGuardrails(parsed.guardrails);
  return {
    motive,
    metric,
    guardrails,
    parentId: parsed.parentId ?? null,
  };
}

function parseId(value: unknown, label = "id"): string {
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new AppError("VALIDATION", `${label} is invalid`, 400);
  }
  return value.trim();
}

function parseTxHash(value: unknown): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new AppError("VALIDATION", "Transaction hash is invalid", 400);
  }
  return value;
}

export const getDeploymentFn = createServerFn({ method: "GET" }).handler(
  async () => DEPLOYMENT,
);

export const getGuardDeploymentFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => parseInput(idRequestSchema, input, "Guard request is invalid"))
  .handler(async ({ data }) => guardDeployment(await requireOwnedGuard(data.id, await requireWalletAddress())));

export const probeContractReadsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const active = getActiveDeployment();
    const address = active.contractAddress as `0x${string}`;
    if (!address) {
      throw new AppError("NOT_CERTIFIED", "Contract is not certified yet", 503);
    }
    const { client } = getReadClientForDeployment(active);
    const cases: Array<{ functionName: string; args: Array<string | number> }> = [
      { functionName: "get_contract_info", args: [] },
      { functionName: "get_guard_count", args: [] },
      { functionName: "get_guard_summary", args: [0] },
      { functionName: "get_guard_status", args: [0] },
      { functionName: "get_guard_definition", args: [0] },
      { functionName: "get_guard_lineage", args: [0] },
      { functionName: "get_guard_evidence", args: [0] },
      { functionName: "get_guard_findings", args: [0] },
      { functionName: "get_guard_verdict", args: [0] },
      { functionName: "get_guard", args: [0] },
      { functionName: "get_guards_by_owner", args: [DEPLOYMENT.deployer] },
    ];
    const rows: Array<{
      functionName: string;
      args: Array<string | number>;
      ok: boolean;
      ms: number;
      result: string;
      error: string;
    }> = [];
    for (const item of cases) {
      const started = Date.now();
      try {
        const result = await client.readContract({
          address,
          functionName: item.functionName,
          args: item.args,
        });
        rows.push({
          functionName: item.functionName,
          args: item.args,
          ok: true,
          ms: Date.now() - started,
          result: JSON.stringify(result, (_, v) =>
            typeof v === "bigint" ? v.toString() : v,
          ),
          error: "",
        });
      } catch (err) {
        rows.push({
          functionName: item.functionName,
          args: item.args,
          ok: false,
          ms: Date.now() - started,
          result: "",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return {
      address,
      probedAt: new Date().toISOString(),
      allPass: rows.every((r) => r.ok),
      rows,
    };
  },
);

export const listGuardsFn = createServerFn({ method: "GET" }).handler(async () => {
  const ownerAddress = await requireWalletAddress();
  const guards = await listGuards({ includeExamples: false, ownerAddress, limit: 50 });
  const stats = await analytics(ownerAddress);
  return { guards, stats };
});

export const recordActionAuditFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(actionAuditRequestSchema, input, "Action audit request is invalid"))
  .handler(async ({ data }) => {
    const actorWallet = await requireWalletAddress();
    await recordActionAudit({ ...data, actorWallet });
    return { recorded: true, operationId: data.operationId ?? null };
  });

export const getGuardFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => parseInput(idRequestSchema, input, "Guard request is invalid"))
  .handler(async ({ data }) => {
    const guard = await getGuard(parseId(data.id, "Guard id"));
    if (!guard) throw new AppError("NOT_FOUND", "Guard not found", 404);
    const publicGuard = isPublicGuard(guard);
    const session = publicGuard ? await getWalletSession() : null;
    const ownerAddress = publicGuard
      ? session && !guard.isExample && sameWallet(guard.ownerAddress, session.address)
        ? session.address
        : undefined
      : await requireWalletAddress();
    if (ownerAddress && !sameWallet(guard.ownerAddress, ownerAddress)) {
      throw new AppError("FORBIDDEN", "You do not control this Guard", 403);
    }
    const receiptId = await receiptForGuard(guard.id);
    /**
     * N27 root cause.
     *
     * Run history was gated on an OWNER wallet session, so a resolved public
     * case — the exact case whose receipt is already published to anyone —
     * reported "0 runs / No Runs yet" even though its Run existed and its
     * evidence was finalized on chain. The visibility rule now matches the
     * receipt's: a public Guard's Run history is public, read-only, and
     * associated by the explicit durable guard id (never by "latest Run").
     */
    const runs = await listRuns(guard.id, ownerAddress);
    return { guard, receiptId, runs };
  });

export const createGuardFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseDraftInput(input))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const parsed = parseDraft(data);
    const version = parsed.parentId ? 2 : 1;
    const guard = await insertGuard({ ...parsed, version, ownerAddress });
    return { guard };
  });

export const updateDraftFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(updateDraftRequestSchema, input, "Guard update is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const parsed = parseDraft(data);
    const guard = await updateDraft(parseId(data.id, "Guard id"), parsed, ownerAddress);
    return { guard };
  });

export const armGuardFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(idRequestSchema, input, "Guard request is invalid"))
  .handler(async ({ data }) => {
    const guard = await armLocal(parseId(data.id, "Guard id"), await requireWalletAddress());
    return { guard, lockKind: "LOCAL" as const };
  });

export const preflightFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(idRequestSchema, input, "Guard request is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const guard = await requireOwnedGuard(parseId(data.id, "Guard id"), ownerAddress);
    const { report, model } = await preflight(
      guard.motive,
      guard.metric,
      guard.guardrails,
    );
    await saveAdvisory(guard.id, "preflight", report, model, ownerAddress);
    return { report, model };
  });

export const loopholeFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(idRequestSchema, input, "Guard request is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const guard = await requireOwnedGuard(parseId(data.id, "Guard id"), ownerAddress);
    const { report, model } = await loopholeScan(
      guard.motive,
      guard.metric,
      guard.guardrails,
    );
    await saveAdvisory(guard.id, "loophole", report, model, ownerAddress);
    return { report, model };
  });

export const blueprintFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => parseInput(idRequestSchema, input, "Guard request is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const guard = await requireOwnedGuard(parseId(data.id, "Guard id"), ownerAddress);
    return {
      report: evidenceBlueprint(guard.motive, guard.metric, guard.guardrails),
    };
  });

export const addGuardrailFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(addGuardrailRequestSchema, input, "Guardrail request is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const guard = await requireOwnedGuard(parseId(data.id, "Guard id"), ownerAddress);
    const guardrail = parseGuardrails([data.guardrail])[0];
    if (!guardrail) throw new AppError("VALIDATION", "Guardrail is invalid", 400);
    const next = parseGuardrails([...guard.guardrails, guardrail]);
    const updated = await updateDraft(guard.id, {
      motive: guard.motive,
      metric: guard.metric,
      guardrails: next,
    }, ownerAddress);
    return { guard: updated };
  });

export const startRunFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(runCreateSchema, input, "Run request is invalid"))
  .handler(async ({ data }) => {
    const guardId = parseId(data.guardId, "Guard id");
    const agentRef = typeof data.agentRef === "string" ? data.agentRef : "manual";
    const run = await insertRun(guardId, agentRef, await requireWalletAddress());
    return { run };
  });

export const appendEventFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(runEventRequestSchema, input, "Run event request is invalid"))
  .handler(async ({ data }) => {
    const event = parseRunEvent(data.event);
    const run = await appendRunEvent(parseId(data.runId, "Run id"), event, await requireWalletAddress());
    return { run };
  });

export const finishRunFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(runOutcomeRequestSchema, input, "Run completion request is invalid"))
  .handler(async ({ data }) => {
    const outcome = parseOutcome(data.outcome ?? {});
    const run = await finishRun(parseId(data.runId, "Run id"), outcome, await requireWalletAddress());
    return { run };
  });

export const getRunFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => parseInput(idRequestSchema, input, "Run request is invalid"))
  .handler(async ({ data }) => {
    const run = await requireRun(parseId(data.id, "Run id"));
    const guard = await requireGuard(run.guardId);
    /*
     * A Run is readable without a wallet exactly when its Guard already is:
     * the receipt is public, so the evidence behind it must be inspectable too.
     * Everything else still requires the owner wallet.
     */
    if (!isPublicGuard(guard)) {
      const ownerAddress = await requireWalletAddress();
      if (!sameWallet(guard.ownerAddress, ownerAddress)) {
        throw new AppError("FORBIDDEN", "You do not control this Run", 403);
      }
    }
    return { run, guard };
  });

export const submitEvidenceFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(guardRunRequestSchema, input, "Evidence request is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const guard = await requireOwnedGuard(parseId(data.guardId, "Guard id"), ownerAddress);
    const run = await requireOwnedRun(parseId(data.runId, "Run id"), ownerAddress);
    if (run.guardId !== guard.id) {
      throw new AppError("MISMATCH", "Run does not belong to this guard", 400);
    }
    const snapshot = await ensureRunEvidenceSnapshot(run, guard.onchainId ?? guard.id);
    const updated = await attachEvidence(guard.id, snapshot.manifest, ownerAddress);
    return { guard: updated, manifest: snapshot.manifest };
  });

export const evaluateFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(idRequestSchema, input, "Guard request is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const guard = await requireOwnedGuard(parseId(data.id, "Guard id"), ownerAddress);
    if (guard.status !== "EVIDENCE_SUBMITTED") {
      throw new AppError("INVALID_STATE", "Evaluation requires submitted evidence", 409);
    }
    if (!guard.evidenceJson) {
      throw new AppError("MISSING_EVIDENCE", "No evidence commitment", 400);
    }
    if (guard.authority === "GENLAYER") {
      throw new AppError("LOCKED", "Finalized GenLayer verdict cannot be overwritten", 409);
    }
    let evidence: EvidenceManifest;
    try {
      evidence = parseEvidence(JSON.parse(guard.evidenceJson));
    } catch {
      throw new AppError("DATA_CORRUPT", "Stored evidence is invalid", 500);
    }
    const { findings, model } = await adjudicateLocal(
      guard.motive,
      guard.metric,
      guard.guardrails,
      evidence,
    );
    const verdict = mapVerdict(findings);
    const resolved = await resolveLocal(guard.id, findings, verdict, ownerAddress);
    await saveAdvisory(guard.id, "adjudication", { findings, verdict, model }, model, ownerAddress);
    const receiptId = await receiptForGuard(resolved.id);
    return {
      guard: resolved,
      findings,
      verdict,
      model,
      receiptId,
      authority: "LOCAL" as const,
      advisory: true,
    };
  });

export const driftFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(runIdRequestSchema, input, "Run request is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const run = await requireOwnedRun(parseId(data.runId, "Run id"), ownerAddress);
    const guard = await requireGuard(run.guardId);
    const { report, model } = await motiveDrift(guard.motive, run.events);
    await saveAdvisory(guard.id, "drift", report, model, ownerAddress);
    return { report, model };
  });

export const remediateFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(idRequestSchema, input, "Guard request is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const guard = await requireOwnedGuard(parseId(data.id, "Guard id"), ownerAddress);
    if (!guard.findings) {
      throw new AppError("INVALID_STATE", "Remediation requires a verdict", 409);
    }
    const { plan, model } = await remediation(
      guard.motive,
      guard.metric,
      guard.guardrails,
      guard.findings,
    );
    await saveAdvisory(guard.id, "remediation", plan, model, ownerAddress);
    return { plan, model };
  });

export const createV2Fn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(createV2RequestSchema, input, "V2 Guard request is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const parent = await requireOwnedGuard(parseId(data.parentId, "Parent guard id"), ownerAddress);
    if (parent.status === "DRAFT") {
      throw new AppError("INVALID_STATE", "Version a locked or resolved guard", 409);
    }
    const parsed = parseDraft({
      motive: data.motive,
      metric: data.metric,
      guardrails: data.guardrails,
      parentId: parent.id,
    });
    const version = parent.version + 1;
    const hash = await definitionHash(parsed.motive, parsed.metric, parsed.guardrails);
    // The parent/version key is the server-side idempotency scope. The
    // definition is the fingerprint, so a concurrent different V2 cannot
    // silently create a second draft for the same lineage slot.
    return idempotent(
      "create_guard_v2",
      `${ownerAddress.toLowerCase()}:${parent.id}:${version}`,
      hash,
      async () => {
        const existing = await findGuardVersion(parent.id, version, ownerAddress);
        if (existing) {
          if (existing.definitionHash !== hash) {
            throw new AppError("CONFLICT", "This Guard version already has a different definition", 409);
          }
          return { guard: existing };
        }
        return {
          guard: await insertGuard({ ...parsed, version, ownerAddress }),
        };
      },
    );
  });

export const getReceiptFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => parseInput(idRequestSchema, input, "Receipt request is invalid"))
  .handler(async ({ data }) => {
    const receipt = await getReceipt(parseId(data.id, "Receipt id"));
    if (!receipt) throw new AppError("NOT_FOUND", "Receipt not found", 404);
    const guard = await getGuard(receipt.guardId);
    if (!guard) throw new AppError("DATA_CORRUPT", "Receipt Guard is unavailable", 500);
    if (!isPublicGuard(guard)) {
      const ownerAddress = await requireWalletAddress();
      if (!sameWallet(guard.ownerAddress, ownerAddress)) {
        throw new AppError("FORBIDDEN", "You do not control this receipt", 403);
      }
    }
    return { receipt, guard };
  });

export const healthFn = createServerFn({ method: "GET" }).handler(async () => {
  return {
    status: "ok",
    db: true,
    contract: DEPLOYMENT,
    time: new Date().toISOString(),
  };
});

export const hashDefinitionFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseDraftInput(input))
  .handler(async ({ data }) => {
    const parsed = parseDraft(data);
    const hash = await definitionHash(parsed.motive, parsed.metric, parsed.guardrails);
    return { hash };
  });

export const prepareEvidenceFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(guardRunRequestSchema, input, "Evidence request is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const guard = await requireOwnedGuard(parseId(data.guardId, "Guard id"), ownerAddress);
    const run = await requireOwnedRun(parseId(data.runId, "Run id"), ownerAddress);
    if (run.guardId !== guard.id) {
      throw new AppError("MISMATCH", "Run does not belong to this guard", 400);
    }
    if (run.status !== "FINISHED") {
      throw new AppError("INVALID_STATE", "Finish the run before submitting evidence", 409);
    }
    if (guard.status !== "ARMED" && guard.status !== "EVIDENCE_SUBMITTED") {
      throw new AppError("INVALID_STATE", "Evidence requires an armed guard", 409);
    }
    // Replay the snapshot pinned at Finish Run. Rebuilding here would let the
    // preview drift from what the wallet is about to commit.
    if (!guard.onchainId) {
      throw new AppError("INVALID_STATE", "This Guard is not on Studionet yet.", 409);
    }
    const snapshot = await ensureRunEvidenceSnapshot(run, guard.onchainId);
    if (snapshot.manifest.guardId !== guard.onchainId) {
      throw new AppError(
        "MISMATCH",
        "The Run's evidence snapshot targets a different on-chain Guard.",
        409,
      );
    }
    return {
      manifest: snapshot.manifest,
      encoded: snapshot.encoded,
      onchainId: guard.onchainId,
      eventCount: snapshot.manifest.events.length,
      commitmentHash: snapshot.commitmentHash,
    };
  });

export const reserveCreateGuardFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(createReservationRequestSchema, input, "Create reservation is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    return reserveCreateGuard(parseId(data.id, "Guard id"), data.reservationToken, ownerAddress);
  });

export const releaseCreateGuardFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(createReservationRequestSchema, input, "Create reservation is invalid"))
  .handler(async ({ data }) => {
    await releaseCreateGuard(parseId(data.id, "Guard id"), data.reservationToken, await requireWalletAddress());
    return { released: true };
  });

export const confirmCreateFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(confirmCreateRequestSchema, input, "Create confirmation is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const id = parseId(data.id, "Guard id");
    const local = await requireOwnedGuard(id, ownerAddress);
    if (!local.onchainId && !local.txCreate) {
      await recordChainTransaction(id, {
        operation: "create_guard",
        txHash: parseTxHash(data.txHash),
        originatingWallet: ownerAddress,
        chainId: guardDeployment(local).chainId,
        contractAddress: guardDeployment(local).contractAddress,
        submittedAt: new Date().toISOString(),
      }, ownerAddress);
    }
    const result = await reconcileTransaction(id, "create_guard", ownerAddress);
    if (result.state === "mismatch") throw new AppError("MISMATCH", result.message ?? "Create transaction could not be reconciled", 409);
    if (result.state !== "reconciled") {
      throw new AppError("CONFIRMATION_UNAVAILABLE", result.message ?? "Transaction confirmation is temporarily unavailable", 409);
    }
    return { guard: result.guard, chainStatus: result.status ? asStatus(result.status) : "DRAFT" as const };
  });

export const recordCreateSubmissionFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(recordCreateSubmissionRequestSchema, input, "Create transaction provenance is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const local = await requireOwnedGuard(data.id, ownerAddress);
    const resource = requireActiveWrite(resolvedDeployment(local));
    if (data.chainId !== resource.chainId) {
      throw new AppError("WRONG_NETWORK", `Create transactions must target ${resource.networkName}`, 409);
    }
    if (data.contractAddress.toLowerCase() !== resource.contractAddress.toLowerCase()) {
      throw new AppError("CONTRACT_MISMATCH", "Create transaction contract is not certified", 409);
    }
    if (!sameWallet(data.originatingWallet, ownerAddress)) {
      throw new AppError("FORBIDDEN", "Submitted wallet does not match the wallet session", 403);
    }
    const guard = await recordChainTransaction(data.id, {
      operation: data.operation,
      txHash: parseTxHash(data.txHash),
      originatingWallet: data.originatingWallet,
      chainId: data.chainId,
      contractAddress: data.contractAddress,
      submittedAt: data.submittedAt,
      reservationToken: data.reservationToken,
    }, ownerAddress);
    return { guard };
  });

export const recordTransactionFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(recordTransactionRequestSchema, input, "Transaction provenance is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const local = await requireOwnedGuard(data.id, ownerAddress);
    const resource = resolvedDeployment(local);
    if (data.operation !== "create_guard") requireActiveWrite(resource);
    if (data.chainId !== resource.chainId) {
      throw new AppError("WRONG_NETWORK", `Transactions must target ${resource.networkName}`, 409);
    }
    if (data.contractAddress.toLowerCase() !== resource.contractAddress.toLowerCase()) {
      throw new AppError("CONTRACT_MISMATCH", "Transaction contract is not certified", 409);
    }
    if (!sameWallet(data.originatingWallet, ownerAddress)) {
      throw new AppError("FORBIDDEN", "Submitted wallet does not match the wallet session", 403);
    }
    const guard = await recordChainTransaction(data.id, {
      operation: data.operation as ChainOperation,
      txHash: parseTxHash(data.txHash),
      originatingWallet: data.originatingWallet,
      chainId: data.chainId,
      contractAddress: data.contractAddress,
      submittedAt: data.submittedAt,
      expectedGuardId: data.expectedGuardId ?? null,
      expectedEvidenceHash: data.expectedEvidenceHash ?? null,
      reservationToken: data.reservationToken,
    }, ownerAddress);
    return { guard };
  });

export const reconcileTransactionFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(reconcileTransactionRequestSchema, input, "Transaction reconciliation request is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    return reconcileTransaction(data.id, data.operation as ChainOperation, ownerAddress, {
      txHash: data.txHash,
      reservationToken: data.reservationToken,
    });
  });

export const reconcileCreateFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(idRequestSchema, input, "Create reconciliation request is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    return reconcileTransaction(parseId(data.id, "Guard id"), "create_guard", ownerAddress);
  });

export const confirmArmFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(confirmTxRequestSchema, input, "Arm confirmation is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const id = parseId(data.id, "Guard id");
    const local = await requireOwnedGuard(id, ownerAddress);
    if (!local.onchainId) {
      throw new AppError("INVALID_STATE", "Create the Guard on Studionet first", 409);
    }
    if (!local.txArm) {
      await recordChainTransaction(id, {
        operation: "arm_guard",
        txHash: parseTxHash(data.txHash),
        originatingWallet: ownerAddress,
        chainId: guardDeployment(local).chainId,
        contractAddress: guardDeployment(local).contractAddress,
        expectedGuardId: local.onchainId,
        submittedAt: new Date().toISOString(),
      }, ownerAddress);
    }
    const result = await reconcileTransaction(id, "arm_guard", ownerAddress);
    if (result.state === "mismatch") throw new AppError("MISMATCH", result.message ?? "Arm transaction could not be reconciled", 409);
    if (result.state !== "reconciled") throw new AppError("CONFIRMATION_UNAVAILABLE", result.message ?? CONFIRMATION_UNAVAILABLE_MESSAGE, 409);
    return { guard: result.guard, chainStatus: asStatus(result.status ?? result.guard.status) };
  });

export const confirmEvidenceFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(confirmEvidenceRequestSchema, input, "Evidence confirmation is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const id = parseId(data.id, "Guard id");
    const local = await requireOwnedGuard(id, ownerAddress);
    if (!local.onchainId) {
      throw new AppError("INVALID_STATE", "Create the Guard on Studionet first", 409);
    }
    if (!local.txEvidence) {
      await recordChainTransaction(id, {
        operation: "submit_evidence",
        txHash: parseTxHash(data.txHash),
        originatingWallet: ownerAddress,
        chainId: guardDeployment(local).chainId,
        contractAddress: guardDeployment(local).contractAddress,
        expectedGuardId: local.onchainId,
        submittedAt: new Date().toISOString(),
      }, ownerAddress);
    }
    const result = await reconcileTransaction(id, "submit_evidence", ownerAddress);
    if (result.state === "mismatch") throw new AppError("MISMATCH", result.message ?? "Evidence transaction could not be reconciled", 409);
    if (result.state !== "reconciled") throw new AppError("CONFIRMATION_UNAVAILABLE", result.message ?? CONFIRMATION_UNAVAILABLE_MESSAGE, 409);
    return { guard: result.guard, chainStatus: asStatus(result.status ?? result.guard.status) };
  });

export const confirmEvaluateFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => parseInput(confirmTxRequestSchema, input, "Evaluation confirmation is invalid"))
  .handler(async ({ data }) => {
    const ownerAddress = await requireWalletAddress();
    const id = parseId(data.id, "Guard id");
    const local = await requireOwnedGuard(id, ownerAddress);
    if (!local.onchainId) {
      throw new AppError("INVALID_STATE", "Create the Guard on Studionet first", 409);
    }
    if (!local.txEvaluate) {
      await recordChainTransaction(id, {
        operation: "evaluate_guard",
        txHash: parseTxHash(data.txHash),
        originatingWallet: ownerAddress,
        chainId: guardDeployment(local).chainId,
        contractAddress: guardDeployment(local).contractAddress,
        expectedGuardId: local.onchainId,
        submittedAt: new Date().toISOString(),
      }, ownerAddress);
    }
    const result = await reconcileTransaction(id, "evaluate_guard", ownerAddress);
    if (result.state === "mismatch") throw new AppError("MISMATCH", result.message ?? "Evaluation transaction could not be reconciled", 409);
    if (result.state !== "reconciled" || !result.findings || !result.verdict) {
      throw new AppError("CONFIRMATION_UNAVAILABLE", result.message ?? CONFIRMATION_UNAVAILABLE_MESSAGE, 409);
    }
    const guard = result.guard;
    const receiptId = await receiptForGuard(guard.id);
    return { guard, verdict: result.verdict, findings: result.findings, receiptId, authority: "GENLAYER" as const };
  });

export const readChainGuardFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => parseInput(onchainIdRequestSchema, input, "On-chain Guard request is invalid"))
  .handler(async ({ data }) => {
    const chain = await readChainGuard(parseId(data.onchainId, "On-chain guard id"), data.contractAddress);
    return { chain };
  });

export const listOwnerGuardsFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => parseInput(ownerRequestSchema, input, "Owner request is invalid"))
  .handler(async ({ data }) => {
    const owner = normalizeWalletAddress(data.owner);
    const contractAddress = data.contractAddress ?? getActiveDeployment().contractAddress;
    const result = (await readOnChain("get_guards_by_owner", [owner], contractAddress)) as {
      found?: boolean;
      ids?: string[];
    };
    const { deployment } = chainReadClient(contractAddress);
    return { ids: result?.ids ?? [], contractAddress, chainId: deployment.chainId };
  });
