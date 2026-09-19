import type { Findings, GamingPattern, Verdict } from "./domain.ts";
import { patternLabel } from "./domain.ts";

/**
 * Findings presentation adapter.
 *
 * Authoritative structured findings arrive from finalized contract state; this
 * module decides how they read. Routes, receipts and the landing page all use
 * it, so none of them invents its own wording or shows raw boolean keys as
 * primary UI (H0c).
 */

export type FindingRow = {
  key: keyof Omit<Findings, "primary_pattern">;
  label: string;
  value: string;
  /** Meaning of the value, independent of colour. */
  signal: "positive" | "negative" | "neutral";
};

export function humanReadableFindings(findings: Findings): FindingRow[] {
  return [
    {
      key: "goal_advanced",
      label: "Motive advanced",
      value: findings.goal_advanced ? "Yes" : "No",
      signal: findings.goal_advanced ? "positive" : "negative",
    },
    {
      key: "metric_satisfied",
      label: "Metric target reached",
      value: findings.metric_satisfied ? "Yes" : "No",
      signal: findings.metric_satisfied ? "positive" : "negative",
    },
    {
      key: "material_violation",
      label: "Material guardrail violation",
      value: findings.material_violation ? "Detected" : "Not detected",
      signal: findings.material_violation ? "negative" : "positive",
    },
    {
      key: "circumvention_detected",
      label: "Circumvention",
      value: findings.circumvention_detected ? "Detected" : "Not detected",
      signal: findings.circumvention_detected ? "negative" : "positive",
    },
    {
      key: "evidence_sufficient",
      label: "Evidence sufficient",
      value: findings.evidence_sufficient ? "Yes" : "No",
      signal: findings.evidence_sufficient ? "positive" : "negative",
    },
  ];
}

/** Raw protocol shape — only ever rendered inside <TechnicalDetails>. */
export function technicalFindings(findings: Findings): string {
  return JSON.stringify(findings, null, 2);
}

export function primaryPatternCopy(pattern: GamingPattern | null | undefined): string {
  if (!pattern || pattern === "NONE") return "None";
  return patternLabel(pattern);
}

export function hasMeaningfulPattern(pattern: GamingPattern | null | undefined): boolean {
  return Boolean(pattern && pattern !== "NONE");
}

/**
 * One-sentence narrative used by receipts. Derived from the same adapter so the
 * receipt cannot drift from the Guard page.
 */
export function findingsNarrative(findings: Findings | null | undefined, verdict: Verdict | string): string {
  if (!findings) {
    return `The receipt records ${verdict || "an unresolved result"}, but no structured finding flags are available.`;
  }
  const clauses = humanReadableFindings(findings).map(
    (row) => `${row.label.toLowerCase()}: ${row.value.toLowerCase()}`,
  );
  return `${clauses.join("; ")}. Those findings map to ${verdict || "the recorded outcome"}.`;
}
