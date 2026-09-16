export function isUserRejection(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const rec = err as { code?: unknown; message?: unknown; shortMessage?: unknown; cause?: unknown };
  if (rec.code === 4001 || rec.code === "ACTION_REJECTED") return true;
  const text = `${rec.message ?? ""} ${rec.shortMessage ?? ""}`.toLowerCase();
  if (/user rejected|user denied|rejected the request|denied transaction/.test(text)) {
    return true;
  }
  if (rec.cause) return isUserRejection(rec.cause);
  return false;
}

export function walletErrorMessage(err: unknown, fallback = "Wallet request failed"): string {
  if (isUserRejection(err)) return "Wallet request was rejected.";
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "shortMessage" in err) {
    return String((err as { shortMessage: unknown }).shortMessage);
  }
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return fallback;
}
