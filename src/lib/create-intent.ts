export type CreateIntentState = "RESERVED" | "SUBMITTED" | "RECONCILED" | "RELEASED";

export type CreateIntentIdentity = {
  wallet: string;
  guardId: string;
  version: number;
  definitionHash: string;
  chainId: number;
  contractAddress: string;
};

export type CreateIntentRecord = CreateIntentIdentity & {
  claimToken: string;
  state: CreateIntentState;
  txHash: string | null;
};

export function createGuardIdempotencyKey(input: CreateIntentIdentity): string {
  return [
    "create_guard",
    input.wallet.toLowerCase(),
    input.guardId,
    input.version,
    input.definitionHash.toLowerCase(),
    input.chainId,
    input.contractAddress.toLowerCase(),
  ].join(":");
}

export function createIntentDecision(
  existing: CreateIntentRecord | null,
  requested: CreateIntentIdentity,
): "claim" | "existing" | "conflict" {
  if (!existing) return "claim";
  const same =
    existing.wallet.toLowerCase() === requested.wallet.toLowerCase() &&
    existing.guardId === requested.guardId &&
    existing.version === requested.version &&
    existing.definitionHash.toLowerCase() === requested.definitionHash.toLowerCase() &&
    existing.chainId === requested.chainId &&
    existing.contractAddress.toLowerCase() === requested.contractAddress.toLowerCase();
  if (!same) return "conflict";
  return existing.state === "RELEASED" && !existing.txHash ? "claim" : "existing";
}
