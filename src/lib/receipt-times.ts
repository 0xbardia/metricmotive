import { formatUtc } from "./format.ts";

/**
 * The two times a receipt can show, kept apart on purpose:
 * - onChain: when the contract resolved the Guard (`get_guard.resolved_at`), the time a verifier can check;
 * - recorded: when this app stored the verdict (always a little later).
 */
export function receiptTimes(input: { chainResolvedAt?: string | null; recordedAt?: string | null }) {
  return {
    onChain: input.chainResolvedAt ? formatUtc(input.chainResolvedAt) : null,
    recorded: input.recordedAt ? formatUtc(input.recordedAt) : null,
  };
}
