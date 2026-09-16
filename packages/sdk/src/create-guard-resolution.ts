import { MetricMotiveError } from "./errors.ts";
import type { CreateGuardInput } from "./types.ts";

export type GuardCandidate = {
  id: string;
  motive: string;
  metric: string;
  guardrails_json: string;
  definition_hash?: string;
};

/**
 * Resolve only a unique exact definition. A count or list order is not a
 * creation receipt; ambiguity is safer than returning another concurrent write.
 */
export function resolveCreatedGuardId(
  candidates: GuardCandidate[],
  input: CreateGuardInput,
  definitionHash?: string,
): string {
  const rails = JSON.stringify(input.guardrails);
  const matches = candidates.filter(
    (candidate) =>
      candidate.motive === input.motive &&
      candidate.metric === input.metric &&
      candidate.guardrails_json === rails &&
      (!definitionHash || candidate.definition_hash === definitionHash),
  );
  if (matches.length !== 1) {
    throw new MetricMotiveError(
      "AMBIGUOUS_CREATE",
      matches.length === 0
        ? "Created Guard is not visible yet; retain the transaction hash and retry confirmation."
        : "Multiple matching Guards exist; retain the transaction hash and resolve the creation explicitly.",
      "chain",
    );
  }
  return String(matches[0]!.id);
}
