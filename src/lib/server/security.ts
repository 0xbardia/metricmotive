import { getAddress } from "viem";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { GuardStatus } from "../domain.ts";
import { AppError } from "../errors.ts";

export const STATUS_RANK: Record<GuardStatus, number> = {
  DRAFT: 0,
  ARMED: 1,
  EVIDENCE_SUBMITTED: 2,
  RESOLVED: 3,
};

export function statusRank(status: string): number {
  return status in STATUS_RANK ? STATUS_RANK[status as GuardStatus] : -1;
}

export function isMonotonicStatus(current: string, next: GuardStatus): boolean {
  return statusRank(next) >= statusRank(current);
}

export function normalizeWalletAddress(value: unknown): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new AppError("INVALID_ADDRESS", "A valid wallet address is required", 400);
  }
  try {
    return getAddress(value);
  } catch {
    throw new AppError("INVALID_ADDRESS", "A valid wallet address is required", 400);
  }
}

export function sameWallet(a: unknown, b: unknown): boolean {
  try {
    return normalizeWalletAddress(a).toLowerCase() === normalizeWalletAddress(b).toLowerCase();
  } catch {
    return false;
  }
}

export function hmacHex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function constantTimeHexEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
