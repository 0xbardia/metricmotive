export const TX_PHASES = [
  "idle",
  "need-wallet",
  "wrong-network",
  "request",
  "rejected",
  "pending",
  "confirming",
  "failed",
  "success",
] as const;

export type TxPhase = (typeof TX_PHASES)[number];

export type TxState = {
  phase: TxPhase;
  action: string;
  hash: string | null;
  error: string | null;
  originAddress?: string | null;
  originChainId?: number | null;
  resourceId?: string | null;
};

export const IDLE_TX: TxState = {
  phase: "idle",
  action: "",
  hash: null,
  error: null,
};

const PENDING_TX_KEY = "metricmotive.pending-transaction";
const PENDING_TX_TTL_MS = 24 * 60 * 60_000;
const CREATE_RESERVATION_PREFIX = "metricmotive.create-reservation:";

export function loadCreateReservationToken(resourceId: string): string {
  if (typeof window !== "undefined") {
    try {
      const saved = window.localStorage.getItem(`${CREATE_RESERVATION_PREFIX}${resourceId}`);
      if (saved) return saved;
    } catch {
      // A browser storage failure should not make the wallet write unsafe; the
      // server reservation remains the authoritative duplicate gate.
    }
  }
  const token = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `claim-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(`${CREATE_RESERVATION_PREFIX}${resourceId}`, token);
    } catch {
      // Best effort only; the current tab still holds the token in its caller.
    }
  }
  return token;
}

export function clearCreateReservationToken(resourceId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${CREATE_RESERVATION_PREFIX}${resourceId}`);
  } catch {
    // Best effort only.
  }
}

export function loadPendingTx(resourceId: string): TxState {
  if (typeof window === "undefined") return IDLE_TX;
  try {
    const raw = window.localStorage.getItem(PENDING_TX_KEY);
    if (!raw) return IDLE_TX;
    const saved = JSON.parse(raw) as TxState & { savedAt?: number };
    if (
      saved.resourceId !== resourceId ||
      saved.phase !== "pending" && saved.phase !== "confirming" ||
      typeof saved.hash !== "string" ||
      typeof saved.savedAt !== "number" ||
      Date.now() - saved.savedAt > PENDING_TX_TTL_MS
    ) {
      return IDLE_TX;
    }
    return saved;
  } catch {
    return IDLE_TX;
  }
}

export function persistPendingTx(state: TxState): void {
  if (typeof window === "undefined" || !state.hash || !state.resourceId) return;
  try {
    window.localStorage.setItem(
      PENDING_TX_KEY,
      JSON.stringify({ ...state, savedAt: Date.now() }),
    );
  } catch {
    // Storage is best-effort; the current-page state and DB provenance remain authoritative.
  }
}

export function clearPendingTx(resourceId?: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(PENDING_TX_KEY);
    if (!resourceId || !raw || (JSON.parse(raw) as TxState).resourceId === resourceId) {
      window.localStorage.removeItem(PENDING_TX_KEY);
    }
  } catch {
    window.localStorage.removeItem(PENDING_TX_KEY);
  }
}

export function txBusy(state: TxState): boolean {
  return state.phase === "request" || state.phase === "pending" || state.phase === "confirming";
}

export function txLabel(state: TxState): string {
  const action = {
    create_guard: "Publishing the Guard definition",
    arm_guard: "Locking the motive",
    submit_evidence: "Committing the evidence",
    evaluate_guard: "Requesting the GenLayer verdict",
  }[state.action] ?? "Transaction";
  switch (state.phase) {
    case "need-wallet":
      return "Connect a wallet on GenLayer Studio Dev to continue.";
    case "wrong-network":
      return "Switch to GenLayer Studio Dev";
    case "request":
      return `${action}. Approve this step in your wallet.`;
    case "rejected":
      return "Wallet request was rejected. Nothing was sent.";
    case "pending":
      return state.hash
        ? `${action} submitted. Waiting for Studio Dev confirmation.`
        : `${action}. Waiting for the wallet to submit the transaction.`;
    case "confirming":
      return state.hash
        ? `${action} submitted. Confirmation is taking longer than expected. You can safely check again.`
        : "Reading confirmed contract state.";
    case "failed":
      return state.error ?? "Transaction failed.";
    case "success":
      return `${action} confirmed on GenLayer Studio Dev.`;
    default:
      return "";
  }
}
