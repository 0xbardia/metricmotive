import { evidenceCommitmentPreimage, evidenceManifestPreimage } from "../../packages/sdk/src/evidence.ts";
import { type EvidenceManifest, type RunEvent, type RunRecord, sha256Hex, LIMITS } from "./domain.ts";
import { AppError } from "./errors.ts";
import { parseEvidence } from "./validation.ts";

export { evidenceCommitmentPreimage, evidenceManifestPreimage } from "../../packages/sdk/src/evidence.ts";

export function requireEvidenceEvents(events: RunEvent[]): void {
  if (events.length === 0) {
    throw new AppError(
      "MISSING_EVIDENCE",
      "No recorded events are available for this Run. Record at least one event before submitting evidence.",
      409,
    );
  }
}

export async function buildEvidenceManifest(input: {
  guardId: string;
  run: Pick<RunRecord, "id" | "agentRef" | "startedAt" | "completedAt" | "events" | "outcome">;
}): Promise<EvidenceManifest> {
  requireEvidenceEvents(input.run.events);
  const unsigned = {
    schema: "metricmotive.evidence.v1" as const,
    guardId: input.guardId,
    runId: input.run.id,
    agentRef: input.run.agentRef,
    startedAt: input.run.startedAt,
    completedAt: input.run.completedAt ?? new Date().toISOString(),
    events: input.run.events,
    outcome: input.run.outcome,
  };
  const manifest = {
    ...unsigned,
    manifestHash: await sha256Hex(evidenceManifestPreimage(unsigned)),
  };
  if (JSON.stringify(manifest).length > LIMITS.evidence) {
    throw new AppError("LIMIT", "Evidence bundle exceeds the on-chain bound", 400);
  }
  return manifest;
}

export function evidenceCommitmentHash(manifest: EvidenceManifest): Promise<string> {
  return sha256Hex(evidenceCommitmentPreimage(manifest));
}

/**
 * The exact bytes of one evidence commitment, with both digests.
 *
 * `encoded` is what goes on chain and `commitmentHash` is what the contract
 * stores as `evidence_hash`; pinning all three together is what makes a
 * finished Run replayable instead of re-derivable.
 */
export type RunEvidenceSnapshot = {
  manifest: EvidenceManifest;
  encoded: string;
  manifestHash: string;
  commitmentHash: string;
};

export async function evidenceSnapshotOf(
  manifest: EvidenceManifest,
): Promise<RunEvidenceSnapshot> {
  const encoded = JSON.stringify(manifest);
  return {
    manifest,
    encoded,
    manifestHash: manifest.manifestHash,
    commitmentHash: await evidenceCommitmentHash(manifest),
  };
}

/**
 * Replay a persisted snapshot verbatim.
 *
 * The stored JSON is the submission of record, so it is parsed and re-encoded
 * as-is — never rebuilt from Run columns, whose timestamps are mutable.
 */
export async function replayEvidenceSnapshot(
  snapshotJson: string,
): Promise<RunEvidenceSnapshot> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshotJson);
  } catch {
    throw new AppError("DATA_CORRUPT", "The stored evidence snapshot is not valid JSON.", 500);
  }
  const manifest = parseEvidence(parsed);
  const encoded = JSON.stringify(manifest);
  return {
    manifest,
    encoded,
    manifestHash: manifest.manifestHash,
    commitmentHash: await evidenceCommitmentHash(manifest),
  };
}
