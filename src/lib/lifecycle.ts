import type { GuardStatus, Verdict } from "./domain.ts";
import { CTA, LOCK_HELPER } from "./terminology.ts";

/**
 * Single lifecycle presentation model.
 *
 * protocol state → display step → next action are derived HERE, once.
 * Routes must not compute a step index or write "next step" prose themselves,
 * which is what produced contradictory "DRAFT / 01 Define / STEP 2 OF 2" screens.
 */

export const BUILDER_FLOW = {
  context: "Guard Builder",
  steps: ["Define", "Protect", "Review", "Publish"],
} as const;

export const CASE_LIFECYCLE = {
  context: "Case lifecycle",
  steps: ["Draft", "Lock", "Run", "Verify"],
} as const;

export type LifecycleStage = "DRAFT" | "LOCKED" | "RUN" | "EVIDENCE_COMMITTED" | "RESOLVED";

/** Per-step display state, computed ONCE here so no route recomputes it. */
export type StepState = "complete" | "current" | "upcoming";

/**
 * Lock vocabulary (N1 / N10 / N12).
 *
 * LOCKED may only be reported once the lock is authoritative — a finalized
 * arm_guard transaction whose hash was recorded. A wallet signature, an
 * optimistic local flag or a pending submission is NOT a lock.
 */
export type LockState = "READY_TO_LOCK" | "PUBLISHED_NOT_LOCKED" | "LOCKED";

export const LOCK_LABELS: Record<LockState, string> = {
  READY_TO_LOCK: "READY TO LOCK",
  PUBLISHED_NOT_LOCKED: "PUBLISHED · NOT LOCKED",
  LOCKED: "FROZEN",
};

export type NextAction = {
  /** Stable machine label, used for tests. */
  kind:
    | "publish-and-lock"
    | "lock"
    | "start-run"
    | "commit-evidence"
    | "continue-to-verification"
    | "view-receipt"
    | "motive-drift"
    | "counterfactual-review"
    | "none";
  label: string;
  description: string;
  /** false for optional/advisory affordances that must never outrank the CTA. */
  required: boolean;
};

export type LifecyclePresentation = {
  stage: LifecycleStage;
  /** 0-based index into CASE_LIFECYCLE.steps. -1 when every step is complete. */
  step: number;
  stepLabel: string;
  /** Display state of every case step. Finalized Verify is `complete`, not `current`. */
  stepStates: StepState[];
  lockState: LockState;
  lockLabel: string;
  /** True when the case is finished, so no step shows a fake "current" action. */
  isResolved: boolean;
  /** Human protocol state shown as an eyebrow. */
  protocolLabel: string;
  headline: string;
  body: string;
  nextAction: NextAction;
  /** Optional advisory affordances such as Motive Drift. */
  optionalActions: NextAction[];
  isFinalized: boolean;
  /** Steps a user may openly navigate back to without editing locked content. */
  canNavigateBack: boolean;
  lockedGuard: boolean;
};

export function lifecycleStage(status: GuardStatus): LifecycleStage {
  switch (status) {
    case "DRAFT":
      return "DRAFT";
    case "ARMED":
      return "LOCKED";
    case "EVIDENCE_SUBMITTED":
      return "EVIDENCE_COMMITTED";
    default:
      return "RESOLVED";
  }
}

/**
 * The step a user should act on, given where the case already is.
 *
 * The step index means "what to do NOW", not "the last thing that happened"
 * (N15). A finalized lock is a COMPLETED step, so `LOCKED` advances to Run
 * rather than parking on Lock — otherwise the stepper told users to lock a
 * Guard that was already frozen while the very same card said "start a Run".
 * `LOCKED` and `RUN` therefore share a step and differ only in their action.
 */
export function stageStep(stage: LifecycleStage): number {
  switch (stage) {
    case "DRAFT":
      return 0;
    // Lock is done; the outstanding action is capturing a Run.
    case "LOCKED":
    case "RUN":
      return 2;
    case "EVIDENCE_COMMITTED":
    case "RESOLVED":
      return 3;
  }
}

export function stageLabel(stage: LifecycleStage): string {
  return CASE_LIFECYCLE.steps[stageStep(stage)];
}

export type LifecycleInput = {
  guardStatus: GuardStatus;
  authority: "LOCAL" | "GENLAYER";
  /** True when the Guard has a published on-chain identity. */
  published?: boolean;
  verdict?: Verdict | null;
  /** A finished Run with at least one event is waiting to be committed. */
  hasFinishedRunWithEvidence?: boolean;
  /** A committed evidence fingerprint exists on the Guard. */
  evidenceCommitted?: boolean;
  /** A public receipt exists for this Guard. */
  hasReceipt?: boolean;
  /**
   * The arm_guard transaction hash was recorded for this Guard. For a GENLAYER
   * Guard this is what makes the lock authoritative (N10).
   */
  lockRecorded?: boolean;
  /** evaluate_guard has been submitted; the case is awaiting the verdict (N25). */
  verificationRequested?: boolean;
};

export function getGuardLifecyclePresentation(input: LifecycleInput): LifecyclePresentation {
  const {
    guardStatus,
    authority,
    evidenceCommitted,
    published,
    hasFinishedRunWithEvidence,
    hasReceipt,
    lockRecorded,
    verificationRequested,
  } = input;

  /**
   * N1 / N10 root cause.
   *
   * `armLocal` moves a Guard to ARMED without any chain transaction, so an
   * ARMED row is NOT proof of a lock. For a Guard that lives on chain, the lock
   * is authoritative only when its arm transaction was recorded. Until then the
   * case is still in Draft, and the interface says "published, not locked"
   * rather than claiming a finality that never happened.
   *
   * A LOCAL Guard has no chain to anchor to, so its local lock is the lock —
   * the advisory path is labelled as advisory separately.
   */
  const lockAuthoritative =
    guardStatus === "DRAFT"
      ? false
      : authority === "LOCAL"
        ? true
        : Boolean(lockRecorded);
  const effectiveStatus: GuardStatus = lockAuthoritative ? guardStatus : "DRAFT";

  // Evidence committed but the contract has not resolved yet: the required
  // action is verification, never an optional analytics panel (C0).
  const stage: LifecycleStage =
    effectiveStatus === "EVIDENCE_SUBMITTED" || (effectiveStatus === "ARMED" && evidenceCommitted)
      ? "EVIDENCE_COMMITTED"
      : effectiveStatus === "ARMED" && hasFinishedRunWithEvidence
        ? "RUN"
        : lifecycleStage(effectiveStatus);

  const isFinalized = lockAuthoritative && guardStatus === "RESOLVED" && authority === "GENLAYER";

  const nextAction = ((): NextAction => {
    if (stage === "DRAFT") {
      return {
        kind: "publish-and-lock",
        label: "Publish and lock this Guard",
        description: `${LOCK_HELPER} Two wallet approvals: publish, then lock.`,
        required: true,
      };
    }
    if (stage === "LOCKED") {
      return {
        kind: "start-run",
        label: CTA.startRun,
        description: "The motive is locked. Capture what the agent actually did.",
        required: true,
      };
    }
    if (stage === "RUN") {
      return {
        kind: "commit-evidence",
        label: "Commit evidence from this Run",
        description: "The Run is finished. Commit its evidence fingerprint to GenLayer.",
        required: true,
      };
    }
    if (stage === "EVIDENCE_COMMITTED") {
      return {
        kind: "continue-to-verification",
        label: CTA.continueToVerification,
        description:
          "The evidence fingerprint is committed. Ask GenLayer to evaluate it against the locked specification.",
        required: true,
      };
    }
    if (hasReceipt) {
      return {
        kind: "view-receipt",
        label: CTA.viewReceipt,
        description: "The contract holds the finalized findings and deterministic verdict.",
        required: true,
      };
    }
    return {
      kind: "none",
      label: "No further action",
      description: "This result is recorded. A public receipt is not available for this case.",
      required: true,
    };
  })();

  const optionalActions: NextAction[] =
    stage === "RESOLVED"
      ? [
          {
            kind: "counterfactual-review",
            label: "Optional: review a stronger specification",
            description: "Creates a NEW draft. Advisory only; never a GenLayer finding or verdict.",
            required: false,
          },
          {
            kind: "motive-drift",
            label: "Optional: review motive drift",
            description: "Advisory analytics only. Never a GenLayer finding or verdict.",
            required: false,
          },
        ]
      : [];

  const isResolved = stage === "RESOLVED";
  const effectiveStep = stageStep(stage);

  /**
   * Step display is derived from the stage, never from a route-local index.
   *
   * A resolved case shows every step complete (N28): rendering Verify as the
   * "current" step implied the user still had to act, which contradicted the
   * RESOLVED badge right above it.
   */
  const stepStates: StepState[] = CASE_LIFECYCLE.steps.map((_, index) =>
    isResolved || index < effectiveStep
      ? "complete"
      : index === effectiveStep
        ? "current"
        : "upcoming",
  );

  return {
    stage,
    step: effectiveStep,
    stepLabel: stageLabel(stage),
    stepStates,
    lockState: lockStateOf(stage, published, lockRecorded, authority),
    lockLabel: LOCK_LABELS[lockStateOf(stage, published, lockRecorded, authority)],
    isResolved,
    protocolLabel: protocolLabel(stage, effectiveStatus, verificationRequested),
    headline: headline(stage, authority, Boolean(published), verificationRequested),
    body: body(stage, authority),
    nextAction,
    optionalActions,
    isFinalized,
    canNavigateBack: lockAuthoritative,
    lockedGuard: lockAuthoritative,
  };
}

/**
 * N1 / N10: never claim a lock before it is authoritative.
 *
 * `lockRecorded` is set from the persisted arm_guard transaction hash. A DRAFT
 * Guard that has only been published reports PUBLISHED · NOT LOCKED rather than
 * LOCKED, so the UI cannot imply finality a wallet signature did not create.
 */
export function lockStateOf(
  stage: LifecycleStage,
  published: boolean | undefined,
  lockRecorded: boolean | undefined,
  authority: "LOCAL" | "GENLAYER" = "GENLAYER",
): LockState {
  if (stage !== "DRAFT") return "LOCKED";
  // Not locked yet. Distinguish "never published" from "published but the lock
  // has not been finalized", so the copy can match the real position.
  const onChainPending = authority === "GENLAYER" && (published || lockRecorded);
  return onChainPending ? "PUBLISHED_NOT_LOCKED" : "READY_TO_LOCK";
}

/** The step a caller should treat as actionable, or -1 when the case is done. */
export function currentStepIndex(presentation: Pick<LifecyclePresentation, "stepStates">): number {
  return presentation.stepStates.indexOf("current");
}

function protocolLabel(
  stage: LifecycleStage,
  status: GuardStatus,
  verificationRequested: boolean | undefined,
): string {
  if (status === "RESOLVED") return "RESOLVED";
  // N25: once evaluation is in flight the case is verifying, not "committed".
  if (verificationRequested) return "VERIFYING";
  if (status === "EVIDENCE_SUBMITTED") return "EVIDENCE COMMITTED";
  if (status === "ARMED") return stage === "RUN" ? "RUN IN PROGRESS" : "LOCKED";
  return "DRAFT";
}

function headline(
  stage: LifecycleStage,
  authority: "LOCAL" | "GENLAYER",
  published: boolean,
  verificationRequested: boolean | undefined,
): string {
  switch (stage) {
    case "DRAFT":
      return published ? "Definition published. Lock it to make it immutable." : "Ready to publish the definition.";
    case "LOCKED":
      return "Guard locked. Start capturing evidence.";
    case "RUN":
      return "Run finished. Commit its evidence.";
    case "EVIDENCE_COMMITTED":
      return verificationRequested
        ? "Verification in progress."
        : "Evidence committed. Continue to verification.";
    default:
      return authority === "GENLAYER" ? "Verified by GenLayer." : "A local advisory result is ready.";
  }
}

function body(stage: LifecycleStage, authority: "LOCAL" | "GENLAYER"): string {
  switch (stage) {
    case "DRAFT":
      return "The definition is still editable. Publish it, then approve the separate lock transaction in your wallet.";
    case "LOCKED":
      return "This version is immutable on-chain. The next step is to record what the agent actually did.";
    case "RUN":
      return "Evidence stays off-chain until you commit its fingerprint. Nothing about the locked Guard changes.";
    case "EVIDENCE_COMMITTED":
      return "GenLayer evaluates the semantic question against the locked motive, metric, and guardrails.";
    default:
      return authority === "GENLAYER"
        ? "The contract holds the finalized findings and deterministic verdict. Review the evidence that mattered below."
        : "This analysis is advisory. It is not a GenLayer consensus result.";
  }
}

/** Builder step for the create flow, kept separate from the case lifecycle. */
export function builderProgress(step: number) {
  return {
    context: BUILDER_FLOW.context,
    total: BUILDER_FLOW.steps.length,
    current: step,
    label: BUILDER_FLOW.steps[step] ?? BUILDER_FLOW.steps[0],
  };
}
