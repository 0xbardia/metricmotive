import type { Findings, Guardrail, RunEvent } from "./domain.ts";

/**
 * Explains a metric outcome WITHOUT inventing arithmetic (C0b).
 *
 * Two truthful modes:
 *
 *  MODE A "exact"  — only when canonical evidence proves the exclusions are
 *                    event-identifiable and mutually disjoint. Every deduction
 *                    then carries its own provenance reference.
 *  MODE B          — the default. Lists recorded eligibility observations and
 *                    the authoritative contract finding, and presents NO
 *                    derived eligible total, because overlapping populations
 *                    (a duplicate booking that is also outside ICP) cannot be
 *                    subtracted without double-counting.
 *
 * The frontend explains the verdict. It never determines it.
 */

export type EligibilityObservation = {
  /** Recorded label, transcribed from the evidence event. */
  label: string;
  /** Recorded count, or null when the event records no number. */
  quantity: number | null;
  /** Free-text detail exactly as recorded. */
  detail: string;
};

export type ExactDeduction = {
  label: string;
  count: number;
  /** Must be true: event identity proves this population is disjoint. */
  disjoint: boolean;
  /** Evidence/transaction reference backing the deduction. */
  provenance: string;
};

export type MetricExplanation =
  | {
      mode: "exact";
      rawObserved: number;
      deductions: ExactDeduction[];
      eligible: number;
      target: number | null;
      reached: boolean | null;
    }
  | {
      mode: "non-arithmetic";
      rawObserved: number | null;
      target: number | null;
      observations: EligibilityObservation[];
      guardrails: Guardrail[];
      reached: boolean | null;
    };

export type MetricExplanationInput = {
  findings: Findings | null;
  guardrails: Guardrail[];
  /** Recorded raw metric observation, transcribed from evidence. */
  rawObserved: number | null;
  target: number | null;
  observations: EligibilityObservation[];
  /** Only supplied by callers that can prove disjoint, event-identified exclusions. */
  exact?: {
    rawObserved: number;
    deductions: ExactDeduction[];
  } | null;
};

/** MODE A is permitted only when every deduction is disjoint and referenced. */
export function canUseExactMode(
  exact: MetricExplanationInput["exact"],
): exact is { rawObserved: number; deductions: ExactDeduction[] } {
  if (!exact) return false;
  if (exact.deductions.length === 0) return false;
  return exact.deductions.every(
    (d) => d.disjoint === true && Boolean(d.provenance) && Number.isFinite(d.count) && d.count >= 0,
  );
}

export function explainMetric(input: MetricExplanationInput): MetricExplanation {
  const reached = input.findings ? input.findings.metric_satisfied : null;

  if (canUseExactMode(input.exact)) {
    const eligible = input.exact.deductions.reduce(
      (total, deduction) => total - deduction.count,
      input.exact.rawObserved,
    );
    return {
      mode: "exact",
      rawObserved: input.exact.rawObserved,
      deductions: input.exact.deductions,
      eligible,
      target: input.target,
      reached,
    };
  }

  return {
    mode: "non-arithmetic",
    rawObserved: input.rawObserved,
    target: input.target,
    observations: input.observations,
    guardrails: input.guardrails,
    reached,
  };
}

const EXCLUSION_HINTS = /duplicate|outside|icp|eligib|misle|invalid|excluded|scope/i;

/**
 * Transcribes eligibility-affecting observations from canonical evidence.
 *
 * This only reads what the evidence itself recorded — it never classifies,
 * counts or subtracts. Events keep their own recorded label, quantity and text.
 */
export function eligibilityObservationsFromEvents(events: RunEvent[]): EligibilityObservation[] {
  const observations: EligibilityObservation[] = [];
  for (const event of events) {
    const data = event.data ?? {};
    const detail =
      firstText(data.observation, data.summary, data.action, data.notes) ??
      event.type.replaceAll("_", " ");
    const label = firstText(data.result) ?? event.type.replaceAll("_", " ");
    if (!EXCLUSION_HINTS.test(`${label} ${detail}`)) continue;
    observations.push({
      label,
      quantity: typeof data.quantity === "number" ? data.quantity : null,
      detail,
    });
  }
  return observations;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Recorded raw metric observation, e.g. "12 calendar-confirmed meetings". */
export function rawMetricObservationFromEvents(events: RunEvent[]): number | null {
  for (const event of events) {
    const quantity = event.data?.quantity;
    if (typeof quantity === "number" && Number.isFinite(quantity)) return quantity;
  }
  return null;
}
