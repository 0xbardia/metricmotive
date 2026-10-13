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
  finishRun: "Finish run",
  reviewEvidence: "Review evidence →",
  buildGuard: "Create a Motive Guard",
  lockGuard: "Lock Guard",
  startRun: "Start a Run",
  finishWithoutEvidence: "Finish without evidence",
  addEvidence: "Go back and add evidence",
  viewOnExplorer: "View on Explorer",
} as const;

export const LOCK_HELPER = "Locks the Motive, Metric, and Guardrails on GenLayer.";

/**
 * Plain-language wording for first-time visitors (D7: Motive Guard / Motive Check / Motive Receipt in user-facing
 * copy only; code identifiers, database columns and API paths keep their names). Protocol words (armed, fingerprint,
 * MUST / QUALITY) stay out of primary UI: use these strings, or attach a <Hint> that glosses the term in one line.
 */
export const GLOSSARY = {
  guard:
    "A Motive Guard is the written definition of success for one agent task: the motive (what you want), the metric (what you will count) and the guardrails (what must not be sacrificed).",
  lock: "Locking freezes that definition on GenLayer, so nobody can rewrite it after the result is known.",
  fee: "Locking sends one transaction and pays a small network fee in GEN from your wallet (test GEN on Studio Dev).",
  signIn: "Saving a draft asks for one free wallet signature that proves the draft is yours. It sends nothing to the network and costs nothing.",
  check: "A Motive Check compares what the agent actually did with the motive and guardrails you locked.",
  verdict: "The verdict is the result of the check, agreed by independent GenLayer validators.",
  evidenceId: "A short ID computed from the evidence. If anyone edits the evidence, the ID changes.",
  receipt: "A Motive Receipt is the public page that shows how a verdict was reached.",
} as const;

/** Guardrail kinds, in words (the stored values MUST / QUALITY never appear in primary UI). */
export const GUARDRAIL_KIND_LABEL = { MUST: "Must not happen", QUALITY: "Quality to preserve" } as const;

/** The three separate steps of using a Motive Guard, with what each one costs. */
export const BUILDER_STEPS = [
  { n: 1, title: "Save the draft", body: GLOSSARY.signIn, cost: "Free" },
  { n: 2, title: "Lock it on-chain", body: GLOSSARY.lock, cost: "Two small network fees: publish the definition, then lock it" },
  { n: 3, title: "Run and verify", body: "Record what the agent did. Validators check it and write the verdict.", cost: "Two small network fees: commit the evidence, then ask GenLayer" },
] as const;

/** One sentence per verdict, used by every surface that shows a verdict. */
export const VERDICT_MEANING = {
  FAITHFUL_SUCCESS: "The agent reached the metric and kept to the motive and guardrails.",
  METRIC_GAMING: "The agent hit the metric but failed the motive.",
  PARTIAL_ALIGNMENT: "The run neither fully honored the motive nor cleanly gamed the metric.",
  INSUFFICIENT_EVIDENCE: "There is not enough captured evidence to decide whether the motive was honored.",
} as const;
