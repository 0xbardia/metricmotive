import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TxPanel } from "@/components/tx-panel";
import { TechnicalDetails } from "@/components/product-ui";
import { WalletControl } from "@/components/wallet-control";
import { auditUiAction } from "@/lib/action-audit";
import { GENLAYER, type Guardrail, type RunEvent } from "@/lib/domain";
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

const UI_ACTION_NAMES: Partial<Record<ChainOperation, string>> = {
  create_guard: "publish_guard",
  arm_guard: "lock_motive",
  submit_evidence: "commit_evidence",
  evaluate_guard: "verify_with_genlayer",
};

function railsJson(guardrails: Guardrail[]): string {
  return JSON.stringify(guardrails);
}

function evidenceEventSummary(event: RunEvent): string {
  const preferred = [event.data.observation, event.data.summary, event.data.action].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  return preferred ?? event.type.replaceAll("_", " ");
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
    originChainId: GENLAYER.chainId,
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
    setTxState({ ...next, resourceId: guardId });
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
        originChainId: GENLAYER.chainId,
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
            originChainId: GENLAYER.chainId,
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
      chainId: GENLAYER.chainId,
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
  if (gate.chainId !== GENLAYER.chainId) {
    setTx({ phase: "wrong-network", action: opts.action, hash: null, error: null });
    try {
      await gate.switchChainAsync({ chainId: GENLAYER.chainId });
    } catch (err) {
      setTx({
        phase: "wrong-network",
        action: opts.action,
        hash: null,
        error: walletErrorMessage(err, "Could not switch to Studionet"),
      });
      return false;
    }
  }
  const startingAddress = gate.address;
  const startingChainId = GENLAYER.chainId;
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
      chainId: GENLAYER.chainId,
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

export function WalletGate({ children }: { children: React.ReactNode }) {
  const { address, chainId } = useAccount();
  if (!address) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-graphite">
          Connect a wallet on Studionet. MetricMotive does not store private keys.
        </p>
        <WalletControl />
      </div>
    );
  }
  if (chainId !== GENLAYER.chainId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-graphite">
          Wallet is on chain {chainId}. Writes require GenLayer Studionet (
          {GENLAYER.chainId}).
        </p>
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
  onUpdated,
}: {
  guardId: string;
  motive: string;
  metric: string;
  guardrails: Guardrail[];
  onchainId: string | null;
  txCreate: string | null;
  txArm: string | null;
  onUpdated: () => void;
}) {
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
  const pendingCreate = !created && createRecovery.hasUnresolved;
  const tx = created ? armRecovery.tx : createRecovery.tx;
  const busy = txBusy(tx);
  const createIntentRef = useRef(false);
  const armIntentRef = useRef(false);

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
        error: "Create the Guard on Studionet first.",
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
        {!created ? (
          <>
            {pendingCreate ? (
              <div className="space-y-3" role="status" aria-live="polite">
                <div className="flex items-center gap-2">
                  <Badge tone="ochre">Step 1 of 2 · submitted</Badge>
                </div>
                <p className="font-display text-2xl">Publishing is in progress.</p>
                <p className="text-sm leading-relaxed text-graphite">
                  Your transaction is safe. Confirmation can resume after a refresh; do not publish this definition again.
                </p>
                <p className="break-all font-mono text-xs text-graphite">tx {createRecovery.hash ?? txCreate}</p>
                <Button
                  variant="outline"
                  onClick={() => void createRecovery.reconcileOnce()}
                  disabled={createRecovery.reconcileBusy}
                  data-action="retry-create-confirmation"
                >
                  {createRecovery.reconcileBusy ? "Checking Studionet…" : "Retry confirmation"}
                </Button>
              </div>
            ) : (
              <>
                <Badge tone="ochre">Step 1 of 2 · publish definition</Badge>
                <p className="mt-2 font-display text-2xl">Publish your motive.</p>
                <p className="text-sm leading-relaxed text-graphite">
                  Publishing creates this Guard on GenLayer as a draft. You will approve the write in your wallet.
                </p>
                <Button className="mt-2" onClick={() => void create()} disabled={busy || createRecovery.hasUnresolved || createIntentRef.current} data-action="create-guard">
                  {createIntentRef.current || busy && tx.action === "create_guard" ? "Preparing publish…" : "Publish definition"}
                </Button>
              </>
            )}
          </>
        ) : (
          <>
            <Badge tone="ochre">Step 2 of 2 · lock motive</Badge>
            <p className="mt-2 font-display text-2xl">Freeze this version.</p>
            <p className="text-sm leading-relaxed text-graphite">
              Locking freezes the Motive, Metric, and Guardrails before the agent runs. After Studionet confirms ARMED, this version cannot be rewritten.
            </p>
            <p className="font-mono text-xs text-graphite">On-chain id {onchainId}</p>
            {armRecovery.hasUnresolved ? (
              <div className="space-y-3" role="status" aria-live="polite">
                <p className="text-sm">Lock transaction submitted. Confirmation can resume after a refresh.</p>
                <p className="break-all font-mono text-xs text-graphite">tx {armRecovery.hash ?? txArm}</p>
                <Button variant="outline" onClick={() => void armRecovery.reconcileOnce()} disabled={armRecovery.reconcileBusy}>
                  {armRecovery.reconcileBusy ? "Checking Studionet…" : "Retry confirmation"}
                </Button>
              </div>
            ) : (
              <Button onClick={() => void lock()} disabled={busy || armRecovery.hasUnresolved} data-action="lock-motive">
                {busy && tx.action === "arm_guard" ? "Locking motive…" : "Lock motive"}
              </Button>
            )}
          </>
        )}
        <TxPanel state={tx} />
      </div>
    </WalletGate>
  );
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

  async function prepare() {
    if (busy || recovery.hasUnresolved || preparing) return;
    if (!onchainId) {
      recovery.setTx({
        phase: "failed",
        action: "submit_evidence",
        hash: null,
        error: "This Guard is not on Studionet yet.",
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
        {recovery.hasUnresolved ? (
          <div className="space-y-3" role="status" aria-live="polite">
            <p className="text-sm">Evidence transaction submitted. Confirmation can resume after a refresh.</p>
            <p className="break-all font-mono text-xs text-graphite">tx {recovery.hash ?? txEvidence}</p>
            <Button variant="outline" onClick={() => void recovery.reconcileOnce()} disabled={recovery.reconcileBusy}>
              {recovery.reconcileBusy ? "Checking Studionet…" : "Retry confirmation"}
            </Button>
          </div>
        ) : prepared ? (
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
                <div><dt className="text-graphite">Manifest</dt><dd className="mt-1 text-sage">Generated and ready</dd></div>
              </dl>
              <ul className="evidence-summary-list" aria-label="Evidence summary">
                {prepared.manifest.events.slice(0, 5).map((event, index) => (
                  <li key={`${event.timestamp}-${index}`}>
                    <time dateTime={event.timestamp}>{event.timestamp.slice(11, 16)} UTC</time>
                    <p><span className="font-medium">{evidenceEventSummary(event)}</span><span className="mt-1 block text-xs text-graphite">Source: {event.source}</span></p>
                  </li>
                ))}
                {prepared.manifest.events.length > 5 ? <li className="py-3 text-sm text-graphite">+ {prepared.manifest.events.length - 5} more events</li> : null}
              </ul>
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
              <Button onClick={() => void submit()} disabled={busy || submitIntentRef.current} data-action="submit-evidence">
                {busy || submitIntentRef.current ? "Committing evidence…" : "Commit evidence to GenLayer"}
              </Button>
              <Button variant="outline" onClick={() => void prepare()} disabled={busy || preparing}>
                {preparing ? "Refreshing preview…" : "Refresh preview"}
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => void prepare()} disabled={busy || preparing} data-action="prepare-evidence">
            {preparing ? "Preparing evidence…" : "Review evidence"}
          </Button>
        )}
        <p className="text-sm text-graphite">
          MetricMotive commits the evidence fingerprint on Studionet. The commitment cannot be replaced.
        </p>
        <TxPanel state={recovery.tx} />
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

  async function verify() {
    if (busy || recovery.hasUnresolved || verifyIntentRef.current) return;
    if (!onchainId) {
      recovery.setTx({
        phase: "failed",
        action: "evaluate_guard",
        hash: null,
        error: "This Guard is not on Studionet yet.",
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
        {recovery.hasUnresolved ? (
          <div className="space-y-3" role="status" aria-live="polite">
            <Badge tone="ochre">Verification in progress</Badge>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <p className="text-sage">✓ Evidence committed</p>
              <p>GenLayer evaluation <span className="text-graphite">in progress</span></p>
              <p>Final verdict <span className="text-graphite">waiting</span></p>
            </div>
            <p className="text-sm text-graphite">Independent validators are evaluating the evidence against the locked motive, metric, and guardrails. Confirmation can resume after a refresh.</p>
            <p className="break-all font-mono text-xs text-graphite">tx {recovery.hash ?? txEvaluate}</p>
            <Button variant="outline" onClick={() => void recovery.reconcileOnce()} disabled={recovery.reconcileBusy}>
              {recovery.reconcileBusy ? "Checking Studionet…" : "Retry confirmation"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button onClick={() => void verify()} disabled={busy || verifyIntentRef.current} data-action="verify-genlayer">
              {busy || verifyIntentRef.current ? "Starting verification…" : "Verify with GenLayer"}
            </Button>
            <p className="text-sm text-graphite">Evidence is already committed. This asks GenLayer to evaluate it against the locked specification.</p>
          </div>
        )}
        <TxPanel state={recovery.tx} />
      </div>
    </WalletGate>
  );
}
