/**
 * Product glossary. One name per destination, used by app, receipt and landing.
 * "Proof", "dossier" and "case" must not be used interchangeably for the same
 * thing — see M13 / L4.
 */

export const TERMS = {
  guard: {
    label: "Guard",
    definition: "A locked specification: the Motive, the Metric, and the Guardrails.",
  },
  case: {
    label: "Case",
    definition: "The complete Guard lifecycle, from draft through verification.",
  },
  run: {
    label: "Run",
    definition: "One execution that produces evidence for a Guard.",
  },
  receipt: {
    label: "Receipt",
    definition: "The public verification document for a resolved Guard.",
  },
  technicalDetails: {
    label: "Technical details",
    definition: "Raw protocol fields, hashes and transaction identifiers.",
  },
} as const;

/** Canonical call-to-action wording. */
export const CTA = {
  openCase: "Open case",
  viewReceipt: "View receipt",
  technicalDetails: "Technical details",
  continueToVerification: "Continue to verification",
  continueToCommitment: "Review commitment details →",
  reviewEvidence: "Review evidence →",
  buildGuard: "Create a Motive Guard",
  lockGuard: "Lock Guard",
  startRun: "Start a Run",
  finishWithoutEvidence: "Finish without evidence",
  addEvidence: "Go back and add evidence",
  viewOnExplorer: "View on Explorer",
} as const;

export const LOCK_HELPER = "Locks the Motive, Metric, and Guardrails on GenLayer.";
