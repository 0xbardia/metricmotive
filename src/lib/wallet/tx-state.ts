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

export type TxFailureKind = "reverted" | "mismatch" | "failed";

export type TxState = {
  phase: TxPhase;
  action: string;
  hash: string | null;
  error: string | null;
  failureKind?: TxFailureKind;
  /** Polling gave up (cap or non-retryable). Still unresolved: offers Check again, never a resend. */
  delayed?: boolean;
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

function newToken(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `claim-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type TokenStore = Pick<Storage, "getItem" | "setItem">;
const memoryTokens = new Map<string, string>();

/**
 * Per-TAB token: sessionStorage survives a reload of the same tab but is not shared
 * with other tabs, so a second tab presents a different token and is refused by the
 * server reservation. Falls back to an in-memory token if storage throws.
 */
export function tabToken(key: string, store?: TokenStore | null): string {
  try {
    const s = store ?? (typeof window !== "undefined" ? window.sessionStorage : null);
    if (s) {
      const saved = s.getItem(key);
      if (saved) return saved;
      const token = newToken();
      s.setItem(key, token);
      return token;
    }
  } catch {
    // fall through to memory
  }
  let token = memoryTokens.get(key);
  if (!token) memoryTokens.set(key, (token = newToken()));
  return token;
}

export function loadCreateReservationToken(resourceId: string): string {
  return tabToken(`${CREATE_RESERVATION_PREFIX}${resourceId}`);
}

const OPERATION_RESERVATION_PREFIX = "metricmotive.op-reservation:";

/** Stable per-tab token so a reload resumes its own reservation (same token = idempotent). */
export function loadOperationReservationToken(resourceId: string, operation: string): string {
  return tabToken(`${OPERATION_RESERVATION_PREFIX}${operation}:${resourceId}`);
}

function forgetToken(key: string): void {
  memoryTokens.delete(key);
  try {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(key);
  } catch {
    // Best effort only.
  }
}

export function clearOperationReservationToken(resourceId: string, operation: string): void {
  forgetToken(`${OPERATION_RESERVATION_PREFIX}${operation}:${resourceId}`);
}

export function clearCreateReservationToken(resourceId: string): void {
  forgetToken(`${CREATE_RESERVATION_PREFIX}${resourceId}`);
}

const pendingKey = (resourceId: string, action: string) =>
  `${PENDING_TX_KEY}:${resourceId}:${action}`;

function readPending(key: string, resourceId: string): (TxState & { savedAt: number }) | null {
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  const saved = JSON.parse(raw) as TxState & { savedAt?: number };
  if (
    saved.resourceId !== resourceId ||
    (saved.phase !== "pending" && saved.phase !== "confirming") ||
    typeof saved.hash !== "string" ||
    typeof saved.savedAt !== "number" ||
    Date.now() - saved.savedAt > PENDING_TX_TTL_MS
  ) {
    return null;
  }
  return saved as TxState & { savedAt: number };
}

/** Newest pending tx for this guard (or only for `action` when given). Keys are per guard + operation. */
export function loadPendingTx(resourceId: string, action?: string): TxState {
  if (typeof window === "undefined") return IDLE_TX;
  try {
    const ls = window.localStorage;
    // One-time legacy migration: the old single key is moved only if it belongs to THIS guard.
    const legacy = readPending(PENDING_TX_KEY, resourceId);
    if (legacy) {
      ls.setItem(pendingKey(resourceId, legacy.action), JSON.stringify(legacy));
      ls.removeItem(PENDING_TX_KEY);
    }
    let best: (TxState & { savedAt: number }) | null = null;
    const prefix = `${PENDING_TX_KEY}:${resourceId}:`;
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (!key?.startsWith(prefix) || (action && key !== pendingKey(resourceId, action))) continue;
      const saved = readPending(key, resourceId);
      if (saved && (!best || saved.savedAt > best.savedAt)) best = saved;
    }
    return best ?? IDLE_TX;
  } catch {
    return IDLE_TX;
  }
}

export function persistPendingTx(state: TxState): void {
  if (typeof window === "undefined" || !state.hash || !state.resourceId) return;
  try {
    window.localStorage.setItem(
      pendingKey(state.resourceId, state.action),
      JSON.stringify({ ...state, savedAt: Date.now() }),
    );
  } catch {
    // Storage is best-effort; the current-page state and DB provenance remain authoritative.
  }
}

/** Clears one operation's pending tx, or every operation for the guard when `action` is omitted. */
export function clearPendingTx(resourceId?: string, action?: string): void {
  if (typeof window === "undefined") return;
  try {
    const ls = window.localStorage;
    const legacyRaw = ls.getItem(PENDING_TX_KEY);
    if (legacyRaw && (!resourceId || (JSON.parse(legacyRaw) as TxState).resourceId === resourceId)) {
      ls.removeItem(PENDING_TX_KEY);
    }
    const prefix = `${PENDING_TX_KEY}:${resourceId ?? ""}`;
    const keys = Array.from({ length: ls.length }, (_, i) => ls.key(i) ?? "");
    for (const key of keys) {
      if (!key.startsWith(prefix)) continue;
      if (!action || key === pendingKey(resourceId ?? "", action)) ls.removeItem(key);
    }
  } catch {
    // best effort
  }
}

/** Blocked terminal kinds: no retry, only the server recovery message. */
export function isBlockedFailure(state: TxState): boolean {
  return state.phase === "failed" && (state.failureKind === "mismatch" || state.failureKind === "failed");
}

/**
 * A failed state may be replaced by another failed state (fresh server message, or a
 * reverted guess refined to failed/mismatch) but a blocked failure never softens back
 * to reverted, and a failed state never regresses to a non-failed one.
 */
export function canReplaceFailure(previous: TxState, next: TxState): boolean {
  return (
    previous.phase === "failed" &&
    next.phase === "failed" &&
    !(isBlockedFailure(previous) && !isBlockedFailure(next))
  );
}

export function txBusy(state: TxState): boolean {
  return state.phase === "request" || state.phase === "pending" || state.phase === "confirming";
}

export function txLabel(state: TxState): string {
  const action =
    {
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
