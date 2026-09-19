import { cn } from "@/lib/cn";
import { BUILDER_FLOW, CASE_LIFECYCLE, type StepState } from "@/lib/lifecycle";

/**
 * THE stepper. Builder and case lifecycle are distinct systems and are labelled
 * as such, so a page can never show "DRAFT / 01 Define / STEP 2 OF 2" as three
 * competing active-state signals (C3 / C4).
 *
 * Step state is passed in from the lifecycle model — never recomputed here.
 */
export function Stepper({
  kind,
  current,
  states,
  className,
}: {
  kind: "builder" | "lifecycle";
  /** 0-based index of the current step. Ignored when `states` is provided. */
  current: number;
  /**
   * Per-step display states from the lifecycle model. Passed in so the stepper
   * never derives its own notion of "current": a resolved case has NO current
   * step, which `current: number` could not express (N28).
   */
  states?: StepState[];
  className?: string;
}) {
  const { context, steps } = kind === "builder" ? BUILDER_FLOW : CASE_LIFECYCLE;
  const active = Math.min(Math.max(current, 0), steps.length - 1);
  const activeLabel = states
    ? (states.indexOf("current") >= 0 ? steps[states.indexOf("current")] : "All steps complete")
    : steps[active];

  return (
    <nav className={cn("flow-rail-region", className)} aria-label={context}>
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-graphite">{context}</p>
      <ol className="flow-rail mt-2">
        {steps.map((step, index) => {
          const state =
            states?.[index] ?? (index === active ? "current" : index < active ? "complete" : "upcoming");
          return (
            <li key={step} className="flow-rail-step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <span className="flow-rail-number">
                {state === "complete" ? "✓" : String(index + 1).padStart(2, "0")}
              </span>
              <span>{step}</span>
              <span className="sr-only"> — {stateLabel(state)}</span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only">
        {context}: {activeLabel}
      </p>
    </nav>
  );
}

function stateLabel(state: "current" | "complete" | "upcoming"): string {
  if (state === "current") return "current step";
  if (state === "complete") return "completed";
  return "upcoming";
}
