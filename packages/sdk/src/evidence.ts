import type { EvidenceManifest, JsonBag, RunEvent, RunRecord } from "./types.ts";
import { MetricMotiveError } from "./errors.ts";
import { canonicalJson, sha256Hex } from "./canonical.ts";

export {
  canonicalize,
  canonicalJson,
  sha256Hex,
} from "./canonical.ts";

/** The application field is a digest of the manifest without its own hash. */
export function evidenceManifestPreimage(value: Record<string, unknown>): string {
  const unsigned = { ...value };
  delete unsigned.manifestHash;
  return canonicalJson(unsigned);
}

/** The contract commitment is a digest of the complete submitted manifest. */
export function evidenceCommitmentPreimage(value: unknown): string {
  return canonicalJson(value);
}

export async function buildEvidenceManifest(input: {
  guardId: string;
  run: Pick<RunRecord, "id" | "agentRef" | "startedAt" | "completedAt" | "events" | "outcome">;
}): Promise<EvidenceManifest> {
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
  const manifestHash = await sha256Hex(evidenceManifestPreimage(unsigned));
  const manifest = { ...unsigned, manifestHash };
  const encoded = JSON.stringify(manifest);
  if (encoded.length > 8000) {
    throw new MetricMotiveError("LIMIT", `Evidence bundle exceeds 8000 bytes (${encoded.length})`);
  }
  return manifest;
}

export function encodeEvidence(manifest: EvidenceManifest): string {
  return JSON.stringify(manifest);
}

export function evidenceCommitmentHash(manifest: EvidenceManifest): Promise<string> {
  return sha256Hex(evidenceCommitmentPreimage(manifest));
}

export function eventOf(
  type: string,
  data: JsonBag,
  source = "agent",
): RunEvent {
  return {
    timestamp: new Date().toISOString(),
    type: type.slice(0, 64),
    source: source.slice(0, 64),
    data,
  };
}
