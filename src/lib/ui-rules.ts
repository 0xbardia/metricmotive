/**
 * Pure decision rules extracted from route components so the lifecycle
 * guardrails of this pass are directly testable (and cannot silently regress).
 */

/** An empty Run may only be finished after explicit confirmation (C2). */
export function requestFinishDecision(eventCount: number): "confirm" | "finish" {
  return eventCount === 0 ? "confirm" : "finish";
}

export const EMPTY_EVENT_FORM_STATE: {
  observation: string;
  result: string;
  quantity: string;
  notes: string;
} = {
  observation: "",
  result: "",
  quantity: "",
  notes: "",
};

/** After Add evidence the form returns to its empty state (C5). */
export function resetEventFormState(
  _previous?: { observation: string; result: string; quantity: string; notes: string },
): typeof EMPTY_EVENT_FORM_STATE {
  return { ...EMPTY_EVENT_FORM_STATE };
}

/**
 * Mirrors the server's empty-evidence rule so the UI explains it rather than
 * bypassing it. Returns null when submission is allowed.
 */
export function submitEvidenceBlockedReason(eventCount: number): string | null {
  if (eventCount < 1) {
    return "This Run has no evidence, so there is nothing to commit. Record at least one event first.";
  }
  return null;
}

/**
 * Stepper navigation is limited to safe, non-destructive steps. A locked Guard
 * can never be navigated back into editable states (M11).
 */
export function canNavigateToStep(current: number, target: number, status: string): boolean {
  if (target === current) return false;
  if (target < 0 || target > 3) return false;
  if (status === "DRAFT") return true;
  // Once locked, step 0 (Draft) is the editable definition and is unreachable;
  // only forward navigation toward later lifecycle steps is safe.
  return target > current;
}

/** A single in-flight async action blocks any second invocation (H0). */
export function canSubmit(input: {
  busy: boolean;
  intentLocked: boolean;
  disabled: boolean;
}): boolean {
  return !input.busy && !input.intentLocked && !input.disabled;
}
