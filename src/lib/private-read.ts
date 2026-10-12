/** B-04: decide what a failed private read (Guard / Run) should do next. */
export type ReadErrorKind = "auth" | "denied" | "not_found" | "other";

export function classifyReadError(error: unknown): ReadErrorKind {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/not found/i.test(message)) return "not_found";
  if (/authentication|unauthori[sz]ed|sign.?in|session/i.test(message)) return "auth";
  if (/control|access|forbidden|owner/i.test(message)) return "denied";
  return "other";
}

export type PrivateReadStep = "sign-and-retry" | "connect" | "no-access" | "not-found" | "retry";

/**
 * - auth + wallet connected + no signed session  -> prompt a signature, then retry
 * - auth + no wallet                             -> open the connect modal first
 * - denied/auth after a signed session for this wallet -> genuinely no access
 */
export function nextPrivateReadStep(input: {
  errorKind: ReadErrorKind;
  walletConnected: boolean;
  /** True once ensureWalletSession succeeded for the connected wallet this page load. */
  sessionSignedFor: boolean;
}): PrivateReadStep {
  const { errorKind, walletConnected, sessionSignedFor } = input;
  if (errorKind === "not_found") return "not-found";
  if (errorKind === "other") return "retry";
  if (!walletConnected) return "connect";
  return sessionSignedFor ? "no-access" : "sign-and-retry";
}
