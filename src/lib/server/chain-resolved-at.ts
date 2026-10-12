import type { Guard } from "@/lib/domain";
import { guardDeployment } from "@/lib/contract";
import { readChainGuard } from "./chain-read";
import { setChainResolvedAt } from "./repo";

const TIMEOUT_MS = 4_000;
const RETRY_AFTER_MS = 60_000;
const failedAt = new Map<string, number>();

/**
 * Receipts recorded before `chain_resolved_at` existed have no contract time. The first view reads it from the
 * chain (a view call, no transaction) and stores it once. Bounded: 4 s, and a failed read is not retried for a
 * minute, so a slow or down RPC cannot be hammered by page views. Never throws: the receipt just shows "Recorded".
 */
export async function ensureChainResolvedAt(guard: Guard): Promise<Guard> {
  if (guard.chainResolvedAt || guard.authority !== "GENLAYER" || guard.status !== "RESOLVED" || guard.isExample || !guard.onchainId) {
    return guard;
  }
  const last = failedAt.get(guard.id);
  if (last && Date.now() - last < RETRY_AFTER_MS) return guard;
  try {
    const target = guardDeployment(guard);
    const view = await Promise.race([
      readChainGuard(guard.onchainId, target.contractAddress, target.chainId),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("chain read timed out")), TIMEOUT_MS)),
    ]);
    const at = new Date(view.resolved_at);
    if (view.status !== "RESOLVED" || Number.isNaN(at.getTime())) throw new Error("chain has no resolve time");
    await setChainResolvedAt(guard.id, view.resolved_at);
    failedAt.delete(guard.id);
    return { ...guard, chainResolvedAt: view.resolved_at };
  } catch {
    failedAt.set(guard.id, Date.now());
    return guard;
  }
}
