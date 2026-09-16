import { MetricMotiveError } from "./errors.ts";
import type { ChainGuard } from "./types.ts";

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MetricMotiveError("CHAIN_INVALID", `${label} response is invalid`, "chain");
  }
  return value as Record<string, unknown>;
}

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" && typeof value !== "number") {
    throw new MetricMotiveError("CHAIN_INVALID", `Studionet Guard field ${key} is invalid`, "chain");
  }
  return String(value);
}

export function parseChainGuard(value: unknown): ChainGuard {
  const row = record(value, "Guard");
  if (typeof row.found !== "boolean") {
    throw new MetricMotiveError("CHAIN_INVALID", "Studionet Guard found flag is invalid", "chain");
  }
  return {
    found: row.found,
    id: text(row, "id"),
    owner: text(row, "owner"),
    motive: text(row, "motive"),
    metric: text(row, "metric"),
    guardrails_json: text(row, "guardrails_json"),
    status: text(row, "status"),
    evidence_hash: text(row, "evidence_hash"),
    evidence_json: text(row, "evidence_json"),
    findings_json: text(row, "findings_json"),
    verdict: text(row, "verdict"),
    primary_pattern: text(row, "primary_pattern"),
    ...(typeof row.definition_hash === "string" ? { definition_hash: row.definition_hash } : {}),
  };
}

export function parseOwnerGuardIds(value: unknown): string[] {
  const row = record(value, "Owner Guard list");
  if (!Array.isArray(row.ids)) {
    throw new MetricMotiveError("CHAIN_INVALID", "Studionet owner Guard list is invalid", "chain");
  }
  return row.ids.map((id) => {
    if (typeof id !== "string" && typeof id !== "number") {
      throw new MetricMotiveError("CHAIN_INVALID", "Studionet Guard id is invalid", "chain");
    }
    return String(id);
  });
}
