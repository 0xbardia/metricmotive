import { evidenceCommitmentPreimage, evidenceManifestPreimage } from "../../packages/sdk/src/evidence.ts";
import { type EvidenceManifest, type RunEvent, type RunRecord, sha256Hex, LIMITS } from "./domain.ts";
import { AppError } from "./errors.ts";

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
