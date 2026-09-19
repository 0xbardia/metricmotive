import type { RunEvent } from "./domain.ts";

/**
 * Human-readable one-line summary of a recorded event.
 *
 * Shared by the canonical evidence list and the commit preview so both describe
 * the same event the same way (H7).
 */
export function evidenceEventSummary(event: RunEvent): string {
  const observation = event.data.observation ?? event.data.summary ?? event.data.action;
  if (typeof observation === "string" && observation.trim()) return cleanLabel(observation);
  const result = event.data.result;
  if (typeof result === "string" && result.trim()) return cleanLabel(result);
  return event.type.replaceAll("_", " ");
}

/**
 * Truthful one-line summary of a committed evidence event (N29).
 *
 * The receipt used to gesture at "the committed evidence fingerprint" and leave
 * the reader with a hash. This surfaces each recorded observation instead.
 *
 * The recorded observation text is used VERBATIM — only a leading
 * "Action / observation:" style prefix and trailing punctuation are removed.
 * Any attempt to paraphrase it into a tidier label risks changing what the
 * contract actually judged, which is the one thing this document must not do.
 *
 * It deliberately performs NO arithmetic: recorded populations overlap (a
 * duplicate booking can also be outside the ICP), so subtracting one from
 * another to present a single "eligible" number would be a fabricated finding.
 */
export type CommittedEvidenceLine = {
  /** Quantity exactly as recorded, when the event carries one. */
  quantity: number | null;
  /** Recorded observation, transcribed without paraphrase. */
  label: string;
};

const LABEL_PREFIX = /^(?:action\s*\/\s*observation|observation|result|notes)\s*:\s*/i;

export function committedEvidenceLine(event: RunEvent): CommittedEvidenceLine {
  const quantity = typeof event.data.quantity === "number" ? event.data.quantity : null;
  const source = evidenceEventSummary(event).replace(/\s+/g, " ").trim();
  return { quantity, label: cleanLabel(source) };
}

/** Strip a recording prefix and trailing punctuation, preserving the wording. */
export function cleanLabel(text: string): string {
  const stripped = text.replace(LABEL_PREFIX, "").replace(/[.;]\s*$/, "").trim();
  return stripped || text.trim();
}

export function committedEvidenceLines(events: RunEvent[]): CommittedEvidenceLine[] {
  return events.map(committedEvidenceLine);
}
