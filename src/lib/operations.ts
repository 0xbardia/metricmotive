import type { TxState } from "./wallet/tx-state.ts";
import type { Severity } from "./tokens.ts";

/**
 * Normalised async operation model (root fix for C1 / H0 / M7).
 *
 * Every chain mutation reports ONE status, from ONE place. Routes must not
 * stack their own error text on top of the wallet panel's text — that is what
 * produced the same reconciliation error twice, and concatenations such as
 * "Requesting the GenLayer verdict submitted…".
 */

export const OPERATION_STATES = [
  "idle",
  "awaiting_wallet",
  "submitted",
  "confirming",
  "confirmation_delayed",
  "finalized",
  "failed",
] as const;
export type OperationState = (typeof OPERATION_STATES)[number];

/**
 * Transition table for the canonical operation machine (Phase B).
 *
 * A transaction that exists can only move FORWARD: once a hash is recorded the
 * operation may become delayed, but it can never return to `submitted`, never
 * fall back to `awaiting_wallet`, and never become `failed` merely because an
 * RPC read timed out. Monotonic transitions are what stop the "submitted …
 * needs attention … delayed … submitted" flicker (N20) and the simultaneous
 * SUBMITTED + FAILED cards (N21).
 */
const ALLOWED_TRANSITIONS: Record<OperationState, OperationState[]> = {
  idle: ["awaiting_wallet", "submitted", "finalized", "failed"],
  awaiting_wallet: ["submitted", "confirming", "failed", "idle"],
  submitted: ["confirming", "confirmation_delayed", "finalized", "failed"],
  confirming: ["confirmation_delayed", "finalized", "failed"],
  // A delayed confirmation may still resolve, and may still be proven bad —
  // but it can never regress into "submitting again".
  confirmation_delayed: ["finalized", "failed", "confirmation_delayed"],
  finalized: [],
  failed: [],
};

export function canTransition(from: OperationState, to: OperationState): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Rank used to keep displayed state monotonic under out-of-order responses. */
const STATE_RANK: Record<OperationState, number> = {
  idle: 0,
  awaiting_wallet: 1,
  submitted: 2,
  confirming: 3,
  confirmation_delayed: 4,
  finalized: 5,
  failed: 5,
};

/**
 * Never let a late, stale response move an operation backwards (N20).
 *
 * Once an operation is finalized or has a proven failure it is terminal; a
 * delayed confirmation may not be overwritten by a fresh "submitted" read.
 */
export function advance(from: OperationState, to: OperationState): OperationState {
  if (!canTransition(from, to)) return from;
  if (from === "finalized" || from === "failed") return from;
  if (from === "confirmation_delayed" && to === "submitted") return from;
  if (STATE_RANK[to] < STATE_RANK[from] && to !== "failed") return from;
  return to;
}

export type OperationType =
  | "create"
  | "lock"
  | "submitEvidence"
  | "evaluate"
  | "reconcile"
  | "wallet";

export type OperationView = {
  type: OperationType;
  state: OperationState;
  /** Pre-composed, non-concatenated status title. */
  title: string;
  message: string;
  severity: Severity;
  /** Eyebrow shown on the banner. */
  status: string;
  txHash: string | null;
  /** Retry reconciles a persisted hash; it must never resubmit (M7). */
  retryMode: "none" | "reconcile";
  retryLabel: string | null;
  /** Diagnostics shown before a retry is offered. */
  diagnostic: string | null;
  technicalDetails: string | null;
  busy: boolean;
  /** True when the banner should be announced to assistive tech. */
  live: boolean;
};

const OPERATION_TITLES: Record<
  OperationType,
  { request: string; submitted: string; pending: string }
> = {
  create: {
    request: "Publishing the Guard definition",
    submitted: "Guard definition published",
    pending: "Guard definition submitted",
  },
  lock: {
    request: "Locking the Guard",
    submitted: "Guard locked",
    pending: "Lock transaction submitted",
  },
  submitEvidence: {
    request: "Committing the evidence",
    submitted: "Evidence committed",
    pending: "Evidence transaction submitted",
  },
  evaluate: {
    request: "Requesting the GenLayer verdict",
    submitted: "GenLayer verdict requested",
    pending: "Verification request submitted",
  },
  reconcile: {
    request: "Checking GenLayer",
    submitted: "On-chain state reconciled",
    pending: "Reconciliation submitted",
  },
  wallet: {
    request: "Wallet request",
    submitted: "Wallet transaction submitted",
    pending: "Transaction submitted",
  },
};

/**
 * Phase → canonical state.
 *
 * `pending` (hash seen, wallet still reporting) maps to `submitted`; a hash we
 * cannot confirm maps to `confirmation_delayed`, which is explicitly NOT a
 * failure. `rejected` is the only wallet-side failure: the user declined
 * before anything was submitted.
 */
const PHASE_STATE: Record<TxState["phase"], OperationState> = {
  idle: "idle",
  "need-wallet": "awaiting_wallet",
  "wrong-network": "awaiting_wallet",
  request: "awaiting_wallet",
  pending: "submitted",
  confirming: "confirming",
  rejected: "failed",
  failed: "failed",
  success: "finalized",
};

const PHASE_SEVERITY: Record<TxState["phase"], Severity> = {
  idle: "neutral",
  "need-wallet": "info",
  "wrong-network": "warning",
  request: "info",
  pending: "info",
  // Delayed confirmation is a waiting state, not an error: warning is the
  // strongest tone it may carry, and it never reads as danger.
  confirming: "warning",
  rejected: "neutral",
  failed: "danger",
  success: "success",
};

function operationTypeOf(action: string): OperationType {
  switch (action) {
    case "create_guard":
      return "create";
    case "arm_guard":
      return "lock";
    case "submit_evidence":
      return "submitEvidence";
    case "evaluate_guard":
      return "evaluate";
    default:
      return "wallet";
  }
}

/**
 * A confirmed-but-unreconciled transaction is recoverable, not failed: the hash
 * is preserved and Check again only re-reads it.
 */
export function isRecoverable(state: TxState): boolean {
  return (
    (state.phase === "confirming" || state.phase === "pending") && Boolean(state.hash)
  );
}

/**
 * The single, canonical status copy per operation and state.
 *
 * Every string a user can see for an operation comes from here, so the route,
 * the wallet panel and the card cannot each compose their own variant — that is
 * how "Requesting the GenLayer verdict submitted." and the duplicate
 * submitted/failed pair reached production (N21 / N24 / N26).
 */
type OperationCopy = { status: string; title: string; message: string };

function copyFor(
  state: OperationState,
  type: OperationType,
  titles: { request: string; submitted: string; pending: string },
): OperationCopy {
  switch (state) {
    case "awaiting_wallet":
      return {
        status: "Approve in wallet",
        title: titles.request,
        message: "Approve this step in your wallet. Nothing is written until you sign.",
      };
    case "submitted":
      return {
        status: "Submitted",
        title: titles.pending,
        message: "The transaction was submitted. Waiting for GenLayer to confirm it.",
      };
    case "confirming":
      return {
        status: "Confirming",
        title: titles.submitted,
        message: "GenLayer is confirming this transaction.",
      };
    case "confirmation_delayed":
      return {
        status: "Confirmation delayed",
        title: "Confirmation delayed",
        message:
          "The transaction was submitted successfully, but MetricMotive could not confirm it yet. No new transaction will be sent.",
      };
    case "finalized":
      return { status: "Finalized", title: titles.submitted, message: "Confirmed on-chain." };
    case "failed":
      return type === "wallet"
        ? {
            status: "Wallet",
            title: "Wallet request cancelled",
            message: "Nothing was sent. You can try again when you are ready.",
          }
        : {
            status: "Needs attention",
            title: `${titles.request} did not complete`,
            message: "The transaction was not accepted. No on-chain state was created.",
          };
    default:
      return { status: "Status", title: titles.request, message: "" };
  }
}

export function operationViewFromTx(state: TxState): OperationView | null {
  if (state.phase === "idle") return null;
  const type = operationTypeOf(state.action);
  const titles = OPERATION_TITLES[type];

  /**
   * Authority rule (N22): a recorded hash whose finality could not be read is
   * `confirmation_delayed`. It is never `failed`: a failure must be *proven* —
   * an explicit chain revert or a proven semantic mismatch — and an RPC timeout
   * proves neither.
   *
   * PENDING (hash broadcast, wallet still reporting) stays SUBMITTED; CONFIRMING
   * is an in-flight confirmation; only a confirmation that ATTEMPTED and failed
   * becomes DELAYED. That keeps the three distinguishable instead of collapsing
   * every hash into one worry state.
   */
  const hasHash = Boolean(state.hash);
  /**
   * A hash whose finality could not be READ is delayed. `confirming` with no
   * error is a normal in-flight confirmation; `confirming` WITH an error, and a
   * `failed` phase that nonetheless produced a hash, are both delays.
   */
  const delayed =
    hasHash &&
    state.phase !== "success" &&
    state.phase !== "rejected" &&
    (state.phase === "confirming" ? Boolean(state.error) : state.phase === "failed");
  const operationState: OperationState = delayed ? "confirmation_delayed" : PHASE_STATE[state.phase];

  const copy = copyFor(operationState, type, titles);
  const isDelayed = operationState === "confirmation_delayed";

  return {
    type,
    state: operationState,
    status: copy.status,
    title: copy.title,
    message: copy.message,
    severity: isDelayed ? "warning" : PHASE_SEVERITY[state.phase],
    txHash: state.hash,
    // Only a persisted hash offers a retry, and that retry is a re-read.
    retryMode: isDelayed ? "reconcile" : "none",
    retryLabel: isDelayed ? "Check again" : null,
    diagnostic: isDelayed
      ? "No new transaction will be submitted. Checking again only re-reads this transaction."
      : null,
    technicalDetails: state.error,
    busy: state.phase === "request" || state.phase === "pending",
    live: true,
  };
}
/**
 * Collapses candidate messages into at most one banner.
 *
 * Duplicate text from different internal sources renders once; the first error
 * wins so a stale route-level message cannot stack on the live transaction
 * status.
 */
export function dedupeMessages(candidates: Array<string | null | undefined>): string | null {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const text = candidate?.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    return text;
  }
  return null;
}
