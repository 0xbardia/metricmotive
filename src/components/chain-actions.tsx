import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LockSummary, ProvenanceChain } from "@/components/ui/lock-summary";
import { StatusBanner } from "@/components/ui/status-banner";
import { TxStatusBanner } from "@/components/ui/tx-status-banner";
import { TechnicalDetails } from "@/components/product-ui";
import { WalletControl } from "@/components/wallet-control";
import { auditUiAction } from "@/lib/action-audit";
import { type Guardrail } from "@/lib/domain";
import { getActiveDeployment } from "@/lib/contract";
import { ACTIVE_CHAIN_ID } from "@/lib/wallet/chain";
import { CTA } from "@/lib/terminology";
import {
  getGuardDeploymentFn,
  prepareEvidenceFn,
  releaseCreateGuardFn,
  reconcileTransactionFn,
  recordTransactionFn,
  reserveCreateGuardFn,
} from "@/lib/server/actions";
import type { ChainOperation } from "@/lib/reconciliation";
import { writeIntelligentContract, type Eip1193Provider } from "@/lib/wallet/write";
import { ensureWalletSession } from "@/lib/wallet/auth-client";
import { isUserRejection, walletErrorMessage } from "@/lib/wallet/errors";
import {
  clearPendingTx,
  IDLE_TX,
  loadPendingTx,
  persistPendingTx,
  clearCreateReservationToken,
  loadCreateReservationToken,
  type TxState,
  txBusy,
} from "@/lib/wallet/tx-state";
import { confirmationBackoffMs } from "@/lib/reconciliation";
import { advance, operationViewFromTx } from "@/lib/operations";

const UI_ACTION_NAMES: Partial<Record<ChainOperation, string>> = {
  create_guard: "publish_guard",
  arm_guard: "lock_motive",
  submit_evidence: "commit_evidence",
  evaluate_guard: "verify_with_genlayer",
};

function railsJson(guardrails: Guardrail[]): string {
  return JSON.stringify(guardrails);
}

function useWriteGate() {
  const { address, connector } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  return { address, connector, chainId, switchChainAsync };
}

type ReconciliationResult = Awaited<ReturnType<typeof reconcileTransactionFn>>;

function transactionState(
  operation: ChainOperation,
  hash: string | null,
  address: string | undefined,
  error: string | null,
): TxState {
  return {
    phase: "confirming",
    action: operation,
    hash,
    error,
    originAddress: address ?? null,
    originChainId: ACTIVE_CHAIN_ID,
  };
}

function useTransactionReconciliation({
  guardId,
  operation,
  txHash,
  onchainId,
  onUpdated,
}: {
  guardId: string;
  operation: ChainOperation;
  txHash: string | null;
  onchainId: string | null;
  onUpdated: () => void;
}) {
  const gate = useWriteGate();
  const [tx, setTxState] = useState<TxState>(IDLE_TX);
  const [knownHash, setKnownHash] = useState<string | null>(null);
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const hashRef = useRef<string | null>(null);
  const completedRef = useRef(false);
  const inFlight = useRef<Promise<ReconciliationResult | null> | null>(null);
  const reconcileRef = useRef<(() => Promise<ReconciliationResult | null>) | null>(null);
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;

  const setTx = (next: TxState) => {
    if (next.action === operation && next.hash) {
      hashRef.current = next.hash;
      setKnownHash(next.hash);
    }
    if (next.phase === "success") {
      completedRef.current = true;
      clearPendingTx(guardId);
    } else if (next.hash) {
      completedRef.current = false;
      persistPendingTx({ ...next, resourceId: guardId });
    }
    /**
     * Monotonic state (N20): a stale response must never walk a submitted
     * transaction backwards. Once a hash exists the only thing that can end it
     * is proven finality or proven failure — so a later "submitted" write is
     * ignored rather than flickering the card back.
     */
    setTxState((previous) => {
      const previousView = operationViewFromTx(previous);
      const nextView = operationViewFromTx(next);
      if (
        previousView &&
        nextView &&
        previousView.type === nextView.type &&
        previousView.txHash &&
        next.hash === previousView.txHash &&
        advance(previousView.state, nextView.state) === previousView.state &&
        nextView.state !== "finalized"
      ) {
        return previous;
      }
      return { ...next, resourceId: guardId };
    });
  };

  useEffect(() => {
    const stored = loadPendingTx(guardId);
    const storedForOperation = stored.action === operation ? stored : IDLE_TX;
    const hash = txHash || storedForOperation.hash || null;
    hashRef.current = hash;
    setKnownHash(hash);
    completedRef.current = operation === "create_guard" && Boolean(onchainId);
    if (operation === "create_guard" && onchainId) {
      setTxState({
        phase: "success",
        action: operation,
        hash,
        error: null,
        originAddress: gate.address ?? null,
        originChainId: ACTIVE_CHAIN_ID,
        resourceId: guardId,
      });
    } else if (hash) {
      setTxState({
        ...transactionState(
          operation,
          hash,
          gate.address,
          storedForOperation.error ?? "Transaction submitted. Confirmation temporarily unavailable.",
        ),
        resourceId: guardId,
      });
    } else {
      setTxState(IDLE_TX);
    }
  }, [guardId, operation, txHash, onchainId, gate.address]);

  async function reconcileOnce(): Promise<ReconciliationResult | null> {
    const hash = hashRef.current || txHash;
    if (!hash || !gate.address) return null;
    if (inFlight.current) return inFlight.current;
    const task = (async () => {
      setReconcileBusy(true);
      try {
        const result = await reconcileTransactionFn({ data: { id: guardId, operation } });
        const resultHash = result.txHash || hash;
        if (result.state === "reconciled") {
          completedRef.current = true;
          setTx({
            phase: "success",
            action: operation,
            hash: resultHash,
            error: null,
            originAddress: gate.address,
            originChainId: ACTIVE_CHAIN_ID,
          });
          onUpdatedRef.current();
        } else if (result.state === "mismatch") {
          setTx({
            ...transactionState(operation, resultHash, gate.address, result.message ?? "Transaction reconciliation stopped."),
            phase: "failed",
          });
        } else {
          setTx(transactionState(operation, resultHash, gate.address, result.message ?? "Transaction submitted. Confirmation temporarily unavailable."));
        }
        return result;
      } catch {
        setTx(transactionState(operation, hash, gate.address, "Transaction submitted. Confirmation temporarily unavailable."));
        return null;
      } finally {
        setReconcileBusy(false);
      }
    })();
    inFlight.current = task;
    void task.then(
      () => {
        if (inFlight.current === task) inFlight.current = null;
      },
      () => {
        if (inFlight.current === task) inFlight.current = null;
      },
    );
    return task;
  }
  reconcileRef.current = reconcileOnce;

  useEffect(() => {
    if (!knownHash || !gate.address || completedRef.current) return;
    let cancelled = false;
    let attempt = 0;
    let timer: number | undefined;
    let resume: (() => void) | undefined;

    const waitUntilVisible = () => {
      if (document.visibilityState !== "hidden") return Promise.resolve();
      return new Promise<void>((resolve) => {
        const onVisibility = () => {
          if (document.visibilityState !== "hidden") {
            document.removeEventListener("visibilitychange", onVisibility);
            resume = undefined;
            resolve();
          }
        };
        resume = () => {
          document.removeEventListener("visibilitychange", onVisibility);
          resume = undefined;
          resolve();
        };
        document.addEventListener("visibilitychange", onVisibility);
      });
    };

    const poll = async () => {
      if (cancelled) return;
      await waitUntilVisible();
      if (cancelled) return;
      const result = await reconcileRef.current?.();
      if (
        cancelled ||
        result?.state === "reconciled" ||
        result?.state === "mismatch" ||
        result?.state === "unavailable" && result.retryable === false
      ) return;
      attempt += 1;
      if (attempt >= 12) return;
      timer = window.setTimeout(() => void poll(), confirmationBackoffMs(attempt));
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      resume?.();
    };
  }, [knownHash, gate.address, guardId, operation]);

  return {
    tx,
    setTx,
    busy: txBusy(tx),
    reconcileBusy,
    reconcileOnce,
    hasUnresolved: Boolean(knownHash && !completedRef.current),
    hash: knownHash,
  };
}

async function recordTransaction(
  guardId: string,
  operation: ChainOperation,
  address: string,
  hash: `0x${string}`,
  expectedGuardId: string | null,
  reservationToken?: string,
  expectedEvidenceHash?: string,
) {
  const deployment = await getGuardDeploymentFn({ data: { id: guardId } });
  await recordTransactionFn({
    data: {
      id: guardId,
      operation,
      txHash: hash,
      originatingWallet: address,
      chainId: ACTIVE_CHAIN_ID,
      contractAddress: deployment.contractAddress,
      expectedGuardId,
      expectedEvidenceHash,
      reservationToken,
      submittedAt: new Date().toISOString(),
    },
  });
}

async function requireReconciled(
  guardId: string,
  operation: ChainOperation,
): Promise<ReconciliationResult> {
  const result = await reconcileTransactionFn({ data: { id: guardId, operation } });
  if (result.state !== "reconciled") {
    throw new Error(result.message ?? "Transaction submitted. Confirmation temporarily unavailable.");
  }
  return result;
}

async function runWrite(opts: {
  gate: ReturnType<typeof useWriteGate>;
  setTx: (s: TxState) => void;
  action: ChainOperation;
  functionName: string;
  args: unknown[];
  wait: "accepted" | "finalized";
  resourceId?: string;
  idempotencyKey?: string;
  persistHash?: (hash: `0x${string}`) => Promise<void>;
  onSubmitted?: () => void;
  confirm: (hash: `0x${string}`) => Promise<void>;
}): Promise<boolean> {
  const { gate, setTx } = opts;
  if (!gate.address || !gate.connector) {
    setTx({ phase: "need-wallet", action: opts.action, hash: null, error: null });
    return false;
  }
  if (gate.chainId !== ACTIVE_CHAIN_ID) {
    setTx({ phase: "wrong-network", action: opts.action, hash: null, error: null });
    try {
      await gate.switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
    } catch (err) {
      setTx({
        phase: "wrong-network",
        action: opts.action,
        hash: null,
        error: walletErrorMessage(err, "Could not switch to GenLayer Studio Dev"),
      });
      return false;
    }
  }
  const startingAddress = gate.address;
  const startingChainId = ACTIVE_CHAIN_ID;
  const provenance = {
    originAddress: startingAddress,
    originChainId: startingChainId,
    resourceId: opts.resourceId ?? null,
  };
  const setWriteState = (state: TxState) => {
    const next = { ...state, ...provenance };
    setTx(next);
    if (next.phase === "success") clearPendingTx(opts.resourceId);
    else if (next.hash) persistPendingTx(next);
  };
  try {
    await ensureWalletSession(gate.address, gate.connector);
  } catch (err) {
    setTx({
      phase: "failed",
      action: opts.action,
      hash: null,
      error: walletErrorMessage(err, "Wallet authentication failed"),
    });
    return false;
  }
  auditUiAction({
    actionName: UI_ACTION_NAMES[opts.action] ?? opts.action,
    resourceId: opts.resourceId,
    idempotencyKey: opts.idempotencyKey,
  });
  setWriteState({ phase: "request", action: opts.action, hash: null, error: null });
  let submittedHash: `0x${string}` | null = null;
  try {
    if (!opts.resourceId) throw new Error("A persisted Guard is required before a wallet write.");
    const deployment = await getGuardDeploymentFn({ data: { id: opts.resourceId } });
    const result = await writeIntelligentContract({
      contractAddress: deployment.contractAddress,
      account: gate.address,
      connector: gate.connector,
      chainId: ACTIVE_CHAIN_ID,
      functionName: opts.functionName,
      args: opts.args,
      wait: opts.wait,
      onHash: async (hash) => {
        submittedHash = hash;
        setWriteState({ phase: "pending", action: opts.action, hash, error: null });
        await opts.persistHash?.(hash);
        opts.onSubmitted?.();
      },
    });
    submittedHash = result.hash;
    setWriteState({ phase: "confirming", action: opts.action, hash: result.hash, error: null });
    try {
      const provider = (await gate.connector.getProvider()) as Eip1193Provider;
      const accounts = (await provider.request({ method: "eth_accounts" })) as unknown;
      const chain = (await provider.request({ method: "eth_chainId" })) as unknown;
      const currentAddress = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0].toLowerCase() : "";
      const currentChain = typeof chain === "string" ? Number.parseInt(chain, 16) : Number(chain);
      if (currentAddress !== startingAddress.toLowerCase() || currentChain !== startingChainId) {
        throw new Error("Wallet account or network changed while confirming. The submitted transaction is preserved above.");
      }
      await opts.confirm(result.hash);
    } catch (confirmationError) {
      setWriteState({
        phase: "confirming",
        action: opts.action,
        hash: submittedHash,
        error: `${walletErrorMessage(confirmationError, "Confirmation is delayed")}. Do not submit the transaction again yet.`,
      });
      return false;
    }
    setWriteState({ phase: "success", action: opts.action, hash: result.hash, error: null });
    return true;
  } catch (err) {
    if (isUserRejection(err) && !submittedHash) {
      setWriteState({ phase: "rejected", action: opts.action, hash: null, error: null });
      return false;
    }
    if (submittedHash) {
      setWriteState({
        phase: "confirming",
        action: opts.action,
        hash: submittedHash,
        error: `${walletErrorMessage(err, "Confirmation is delayed")}. Do not submit the transaction again yet.`,
      });
      return false;
    }
    setWriteState({
      phase: "failed",
      action: opts.action,
      hash: null,
      error: walletErrorMessage(err, `${opts.action} failed`),
    });
    return false;
  }
}

export function HistoricalReadOnlyNotice() {
  return (
    <p className="text-sm text-graphite" role="status">
      Historical deployment — read only
    </p>
  );
}

function useHistoricalReadOnly(guardId: string): boolean {
  const q = useQuery({
    queryKey: ["guard-deployment", guardId],
    queryFn: () => getGuardDeploymentFn({ data: { id: guardId } }),
    staleTime: 30_000,
  });
  return Boolean(q.data && q.data.status !== "active");
}

export function WalletGate({ children }: { children: React.ReactNode }) {
  const { address, chainId } = useAccount();
  if (!address) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-graphite">
          Connect a wallet on GenLayer Studio Dev. MetricMotive does not store private keys.
        </p>
        <WalletControl />
      </div>
    );
  }
  if (chainId !== ACTIVE_CHAIN_ID) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-graphite">Switch to GenLayer Studio Dev</p>
        <WalletControl />
      </div>
    );
  }
  return <>{children}</>;
}

export function CreateAndLock({
  guardId,
  motive,
  metric,
  guardrails,
  onchainId,
  txCreate,
  txArm,
  locked = false,
  onUpdated,
}: {
  guardId: string;
  motive: string;
  metric: string;
  guardrails: Guardrail[];
  onchainId: string | null;
  txCreate: string | null;
  txArm: string | null;
  /** The Guard is already finalized as locked; no lock action may be offered. */
  locked?: boolean;
  onUpdated: () => void;
}) {
  const historical = useHistoricalReadOnly(guardId);
  const gate = useWriteGate();
  const createRecovery = useTransactionReconciliation({
    guardId,
    operation: "create_guard",
    txHash: txCreate,
    onchainId,
    onUpdated,
  });
  const armRecovery = useTransactionReconciliation({
    guardId,
    operation: "arm_guard",
    txHash: txArm,
    onchainId,
    onUpdated,
  });
  const created = Boolean(onchainId);
  const tx = created ? armRecovery.tx : createRecovery.tx;
  const busy = txBusy(tx);
  const createIntentRef = useRef(false);
  const armIntentRef = useRef(false);
  if (historical) return <HistoricalReadOnlyNotice />;

  async function create() {
    if (busy || createRecovery.hasUnresolved || createIntentRef.current) return;
    createIntentRef.current = true;
    const reservationToken = loadCreateReservationToken(guardId);
    let reserved = false;
    let submitted = false;
    try {
      const reservation = await reserveCreateGuardFn({
        data: { id: guardId, reservationToken },
      });
      if (!reservation.canSubmit) {
        if (reservation.txHash) {
          createRecovery.setTx(transactionState(
            "create_guard",
            reservation.txHash,
            gate.address,
            reservation.message ?? "Transaction submitted. Confirmation can resume without another create.",
          ));
          onUpdated();
        } else {
          createRecovery.setTx({
            phase: "failed",
            action: "create_guard",
            hash: null,
            error: reservation.message ?? "Create is already reserved in another session.",
          });
        }
        return;
      }
      reserved = true;
      await runWrite({
        gate,
        setTx: createRecovery.setTx,
        action: "create_guard",
        functionName: "create_guard",
        args: [motive, metric, railsJson(guardrails)],
        wait: "accepted",
        resourceId: guardId,
        idempotencyKey: reservationToken,
        persistHash: async (hash) => {
          submitted = true;
          if (!gate.address) throw new Error("Wallet disconnected");
          await recordTransaction(guardId, "create_guard", gate.address, hash, null, reservationToken);
        },
        onSubmitted: onUpdated,
        confirm: async () => {
          await requireReconciled(guardId, "create_guard");
          onUpdated();
        },
      });
    } catch (err) {
      createRecovery.setTx({
        phase: "failed",
        action: "create_guard",
        hash: null,
        error: walletErrorMessage(err, "Could not reserve this Guard for creation"),
      });
    } finally {
      if (reserved && !submitted) {
        await releaseCreateGuardFn({ data: { id: guardId, reservationToken } }).catch(() => undefined);
        clearCreateReservationToken(guardId);
      }
      if (!submitted) createIntentRef.current = false;
    }
  }

  async function lock() {
    if (busy || armRecovery.hasUnresolved || createRecovery.hasUnresolved || armIntentRef.current) return;
    if (!onchainId) {
      armRecovery.setTx({
        phase: "failed",
        action: "arm_guard",
        hash: null,
        error: "Create the Guard on GenLayer first.",
      });
      return;
    }
    armIntentRef.current = true;
    let submitted = false;
    await runWrite({
      gate,
      setTx: armRecovery.setTx,
      action: "arm_guard",
      functionName: "arm_guard",
      args: [Number(onchainId)],
      wait: "accepted",
      resourceId: guardId,
      persistHash: async (hash) => {
        submitted = true;
        if (!gate.address) throw new Error("Wallet disconnected");
        await recordTransaction(guardId, "arm_guard", gate.address, hash, onchainId);
      },
      onSubmitted: onUpdated,
      confirm: async () => {
        await requireReconciled(guardId, "arm_guard");
        onUpdated();
      },
    });
    if (!submitted) armIntentRef.current = false;
  }

  return (
    <WalletGate>
      <div className="space-y-4">
        {locked ? (
          /* N11: a finalized lock removes the lock CTA entirely. Leaving it in
             place invited a second lock transaction for an already-frozen
             Guard. */
          <>
            <StatusBanner
              status="Guard locked"
              severity="success"
              title="This Guard version is frozen."
              message="The Motive, Metric, and Guardrails are finalized on GenLayer. Start a Run to capture what the agent does."
              action={
                <Link to="/app/guards/$id" params={{ id: guardId }}>
                  <Button variant="outline">Open case</Button>
                </Link>
              }
            />
            {/* N13: past tense once the write actually happened. */}
            <TechnicalDetails title="What was written on-chain">
              <p className="text-sm leading-relaxed">
                This Guard version — Motive, Metric, and Guardrails — was frozen on {getActiveDeployment().networkName}
                {onchainId ? ` as on-chain Guard ${onchainId}` : ""}. The lock transaction cannot be replayed and the
                definition cannot be rewritten.
              </p>
            </TechnicalDetails>
          </>
        ) : !created ? (
          <>
            {/*
              ONE card per operation (N20).

              This block used to render its own "Publishing is in progress"
              banner while <TxStatusBanner /> rendered the same create
              transaction below — two contradictory cards for one submission
              (and the same again for arm_guard). The canonical
              <TxStatusBanner /> owns unpublished-create state now.
            */}
            {createRecovery.hasUnresolved ? null : (
              <>
                <Badge tone="brand">Step 1 of 2 · publish definition</Badge>
                <p className="mt-2 font-display text-2xl">Publish the Guard definition.</p>
                <p className="text-sm leading-relaxed text-graphite">
                  Publishing creates this Guard on GenLayer as a draft. You will approve the write in your wallet.
                </p>
                <TechnicalDetails className="mt-4" title="What gets written on-chain">
                  <p className="text-sm leading-relaxed">
                    The certified Intelligent Contract stores this definition on {getActiveDeployment().networkName}. Its fingerprint is
                    fixed at publish; locking is a separate transaction. MetricMotive never stores a private key.
                  </p>
                </TechnicalDetails>
                <Button
                  className="mt-2"
                  loading={createIntentRef.current || (busy && tx.action === "create_guard")}
                  loadingLabel="Preparing publish…"
                  disabled={busy || createRecovery.hasUnresolved || createIntentRef.current}
                  onClick={() => void create()}
                  data-action="create-guard"
                >
                  Publish definition
                </Button>
              </>
            )}
          </>
        ) : (
          <>
            <Badge tone="brand">Step 2 of 2 · {CTA.lockGuard}</Badge>
            <p className="mt-2 font-display text-2xl">Lock the Guard.</p>
            <p className="text-sm leading-relaxed text-graphite">
              The definition is already published. Locking freezes the Motive, Metric, and Guardrails on {getActiveDeployment().networkName}.
            </p>
            {onchainId ? (
              <p className="font-mono text-xs text-graphite">On-chain Guard id {onchainId}</p>
            ) : null}
            {/* ONE summary card (N8): the definition is not re-rendered here. */}
            {/* Disclosure precedes the irreversible CTA (N9) and uses present tense
                only until the lock is actually finalized (N13). */}
            <TechnicalDetails className="mt-4" title="What gets written on-chain">
              <p className="text-sm leading-relaxed">
                The lock transaction freezes this Guard version: the Motive, the Metric, and the Guardrails, plus the
                definition fingerprint below. It cannot be rewritten afterwards. The wallet signs this one transaction;
                MetricMotive never stores a private key.
              </p>
            </TechnicalDetails>
            <LockSummary
              className="paper-panel p-5"
              motive={motive}
              metric={metric}
              guardrails={guardrails}
              locked={false}
            />
            {/* The locked CTA exists only while no lock has been submitted (N11). */}
            {armRecovery.hasUnresolved ? null : (
              <Button
                loading={busy && tx.action === "arm_guard"}
                loadingLabel="Locking…"
                disabled={busy || armRecovery.hasUnresolved}
                onClick={() => void lock()}
                data-action="lock-motive"
              >
                {CTA.lockGuard}
              </Button>
            )}
          </>
        )}
        <TxStatusBanner state={tx} onRetry={() => void recoveryRetry(tx, createRecovery, armRecovery)} />
      </div>
    </WalletGate>
  );
}

/** Routes a retry to the reconciliation owner of the active operation. */
function recoveryRetry(
  tx: { action: string },
  createRecovery: { reconcileOnce: () => Promise<unknown> },
  armRecovery: { reconcileOnce: () => Promise<unknown> },
) {
  if (tx.action === "arm_guard") return armRecovery.reconcileOnce();
  return createRecovery.reconcileOnce();
}

export function SubmitEvidenceChain({
  guardId,
  runId,
  onchainId,
  txEvidence,
  onUpdated,
}: {
  guardId: string;
  runId: string;
  onchainId: string | null;
  txEvidence: string | null;
  onUpdated: () => void;
}) {
  const historical = useHistoricalReadOnly(guardId);
  const gate = useWriteGate();
  const recovery = useTransactionReconciliation({
    guardId,
    operation: "submit_evidence",
    txHash: txEvidence,
    onchainId,
    onUpdated,
  });
  const busy = recovery.busy;
  const [prepared, setPrepared] = useState<Awaited<ReturnType<typeof prepareEvidenceFn>> | null>(null);
  const [preparing, setPreparing] = useState(false);
  const submitIntentRef = useRef(false);
  if (historical) return <HistoricalReadOnlyNotice />;

  async function prepare() {
    if (busy || recovery.hasUnresolved || preparing) return;
    if (!onchainId) {
      recovery.setTx({
        phase: "failed",
        action: "submit_evidence",
        hash: null,
        error: "This Guard is not on GenLayer yet.",
      });
      return;
    }
    if (!gate.address || !gate.connector) return;
    setPreparing(true);
    try {
      await ensureWalletSession(gate.address, gate.connector);
    } catch (err) {
      recovery.setTx({ phase: "failed", action: "submit_evidence", hash: null, error: walletErrorMessage(err, "Wallet authentication failed") });
      setPreparing(false);
      return;
    }
    try {
      const result = await prepareEvidenceFn({ data: { guardId, runId } });
      if (result.eventCount < 1 || result.manifest.events.length < 1) {
        throw new Error("Evidence preview is empty. No wallet transaction was sent.");
      }
      setPrepared(result);
    } catch (err) {
      recovery.setTx({ phase: "failed", action: "submit_evidence", hash: null, error: walletErrorMessage(err, "Could not prepare evidence") });
    } finally {
      setPreparing(false);
    }
  }

  async function submit() {
    if (busy || recovery.hasUnresolved || submitIntentRef.current) return;
    if (!prepared) {
      await prepare();
      return;
    }
    if (!onchainId || prepared.manifest.guardId !== onchainId || prepared.manifest.runId !== runId || prepared.eventCount < 1) {
      recovery.setTx({
        phase: "failed",
        action: "submit_evidence",
        hash: null,
        error: "Evidence preview no longer matches this Guard and Run. Refresh the preview before submitting.",
      });
      return;
    }
    submitIntentRef.current = true;
    let submitted = false;
    await runWrite({
      gate,
      setTx: recovery.setTx,
      action: "submit_evidence",
      functionName: "submit_evidence",
      args: [Number(onchainId), prepared.encoded],
      wait: "accepted",
      resourceId: guardId,
      persistHash: async (hash) => {
        submitted = true;
        if (!gate.address) throw new Error("Wallet disconnected");
        await recordTransaction(
          guardId,
          "submit_evidence",
          gate.address,
          hash,
          onchainId,
          undefined,
          prepared.commitmentHash,
        );
      },
      onSubmitted: onUpdated,
      confirm: async () => {
        await requireReconciled(guardId, "submit_evidence");
        onUpdated();
      },
    });
    if (!submitted) submitIntentRef.current = false;
  }

  return (
    <WalletGate>
      <div className="space-y-3">
        {recovery.hasUnresolved ? null : prepared ? (
          <div className="space-y-4" data-evidence-preview>
            <div className="paper-panel space-y-4 p-5">
              <div>
                <Badge tone="sage">Evidence ready for verification</Badge>
                <p className="mt-3 font-display text-2xl">Review what happened.</p>
                <p className="mt-1 text-sm text-graphite">This finished Run is the evidence that will be committed. Review it before opening the wallet.</p>
              </div>
              <dl className="grid gap-3 border-y border-rule py-3 text-sm sm:grid-cols-3">
                <div><dt className="text-graphite">Run</dt><dd className="mt-1 font-mono break-all">{prepared.manifest.runId}</dd></div>
                <div><dt className="text-graphite">Captured</dt><dd className="mt-1 font-display text-xl">{prepared.eventCount} events</dd></div>
                <div><dt className="text-graphite">Manifest</dt><dd className="mt-1 text-[var(--color-sage-text)]">Generated and ready</dd></div>
              </dl>
              {/*
                H7: the full evidence list already lives on the Run page. This
                preview summarises and points there rather than repeating it.
              */}
              <p className="text-sm text-graphite">
                {prepared.manifest.events.length} captured events are included in this manifest. The full list stays on
                the Run page; the canonical contents are below.
              </p>
              {/* A finished Run is already captured, canonicalized and hashed;
                  only the on-chain commit and the verdict remain (N19). */}
              <ProvenanceChain
                className="mm-provenance"
                captured
                canonicalized
                hashed={Boolean(prepared.manifest.manifestHash)}
                committed={Boolean(guardId && (txEvidence || recovery.hash))}
                verified={false}
              />
              <TechnicalDetails title="Evidence integrity">
                <dl>
                  <div><dt>Guard ID</dt><dd>{prepared.manifest.guardId}</dd></div>
                  <div><dt>Manifest hash</dt><dd>{prepared.manifest.manifestHash}</dd></div>
                  <div><dt>Submitted commitment</dt><dd><span className="mr-2">{prepared.commitmentHash}</span></dd></div>
                  <div><dt>Canonical schema</dt><dd>{prepared.manifest.schema}</dd></div>
                </dl>
              </TechnicalDetails>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                loading={busy || submitIntentRef.current}
                loadingLabel="Committing evidence…"
                disabled={busy || submitIntentRef.current}
                onClick={() => void submit()}
                data-action="submit-evidence"
              >
                Commit evidence to GenLayer
              </Button>
              <Button
                variant="outline"
                loading={preparing}
                loadingLabel="Refreshing preview…"
                disabled={busy || preparing}
                onClick={() => void prepare()}
              >
                Refresh preview
              </Button>
            </div>
          </div>
        ) : (
          /*
            N18: the user is already inside the Run's evidence list, which sits
            directly above this control. "Review evidence" was an instruction to
            do what they were doing, so the label names the real next state
            instead: building the commitment.
          */
          <Button
            loading={preparing}
            loadingLabel="Preparing evidence…"
            disabled={busy || preparing}
            onClick={() => void prepare()}
            data-action="prepare-evidence"
          >
            {CTA.continueToCommitment}
          </Button>
        )}
        {recovery.hasUnresolved ? null : (
          <p className="text-sm text-graphite">
            MetricMotive commits the evidence fingerprint on GenLayer. The commitment cannot be replaced.
          </p>
        )}
        {/* THE one status surface for this operation. */}
        <TxStatusBanner
          state={recovery.tx}
          onRetry={() => void recovery.reconcileOnce()}
          retryBusy={recovery.reconcileBusy}
        />
      </div>
    </WalletGate>
  );
}

export function VerifyWithGenLayer({
  guardId,
  onchainId,
  txEvaluate,
  onUpdated,
}: {
  guardId: string;
  onchainId: string | null;
  txEvaluate: string | null;
  onUpdated: () => void;
}) {
  const historical = useHistoricalReadOnly(guardId);
  const gate = useWriteGate();
  const recovery = useTransactionReconciliation({
    guardId,
    operation: "evaluate_guard",
    txHash: txEvaluate,
    onchainId,
    onUpdated,
  });
  const busy = recovery.busy;
  const verifyIntentRef = useRef(false);
  if (historical) return <HistoricalReadOnlyNotice />;

  async function verify() {
    if (busy || recovery.hasUnresolved || verifyIntentRef.current) return;
    if (!onchainId) {
      recovery.setTx({
        phase: "failed",
        action: "evaluate_guard",
        hash: null,
        error: "This Guard is not on GenLayer yet.",
      });
      return;
    }
    verifyIntentRef.current = true;
    let submitted = false;
    await runWrite({
      gate,
      setTx: recovery.setTx,
      action: "evaluate_guard",
      functionName: "evaluate_guard",
      args: [Number(onchainId)],
      wait: "finalized",
      resourceId: guardId,
      persistHash: async (hash) => {
        submitted = true;
        if (!gate.address) throw new Error("Wallet disconnected");
        await recordTransaction(guardId, "evaluate_guard", gate.address, hash, onchainId);
      },
      onSubmitted: onUpdated,
      confirm: async () => {
        await requireReconciled(guardId, "evaluate_guard");
        onUpdated();
      },
    });
    if (!submitted) verifyIntentRef.current = false;
  }

  return (
    <WalletGate>
      <div className="space-y-3">
        {/*
          ONE canonical card (N24). This used to render a hand-written
          "Verification requested." banner *and* <TxStatusBanner /> for the same
          evaluate_guard operation, so a delayed verdict showed two competing
          statuses. <TxStatusBanner /> owns the state; this block only supplies
          the evidence-provenance chain that belongs to verification.
        */}
        {recovery.hasUnresolved ? (
          <ProvenanceChain className="mm-provenance" captured canonicalized hashed committed verified={false} />
        ) : (
          <div className="space-y-2">
            <Button
              loading={busy || verifyIntentRef.current}
              loadingLabel="Starting verification…"
              disabled={busy || verifyIntentRef.current}
              onClick={() => void verify()}
              data-action="verify-genlayer"
            >
              Verify with GenLayer
            </Button>
            <p className="text-sm text-graphite">Evidence is already committed. This asks GenLayer to evaluate it against the locked specification.</p>
          </div>
        )}
        <TxStatusBanner state={recovery.tx} onRetry={() => void recovery.reconcileOnce()} retryBusy={recovery.reconcileBusy} />
      </div>
    </WalletGate>
  );
}
