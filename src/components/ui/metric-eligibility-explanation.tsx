import { Badge } from "@/components/ui/badge";
import type { MetricExplanation } from "@/lib/metric-explanation";

/**
 * Explains a metric outcome truthfully (C0b).
 *
 * MODE A renders arithmetic ONLY when canonical evidence proves the exclusions
 * are event-identified and mutually disjoint. Otherwise MODE B lists recorded
 * eligibility observations and the authoritative contract finding, and shows
 * NO derived eligible count — overlapping populations cannot be subtracted.
 */
export function MetricEligibilityExplanation({
  explanation,
  className,
}: {
  explanation: MetricExplanation;
  className?: string;
}) {
  if (explanation.mode === "exact") {
    return (
      <div className={className} data-explanation-mode="exact">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-graphite">
          Eligible count · derived from event identities
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          <li className="flex justify-between gap-4">
            <span>Raw bookings recorded</span>
            <span className="font-mono tabular-nums">{explanation.rawObserved}</span>
          </li>
          {explanation.deductions.map((deduction) => (
            <li key={deduction.label} className="flex justify-between gap-4 text-graphite">
              <span>
                − {deduction.label}
                <span className="ml-2 font-mono text-[0.68rem]">{deduction.provenance}</span>
              </span>
              <span className="font-mono tabular-nums">{deduction.count}</span>
            </li>
          ))}
          <li className="flex justify-between gap-4 border-t border-rule pt-2 font-medium">
            <span>= Eligible bookings</span>
            <span className="font-mono tabular-nums">{explanation.eligible}</span>
          </li>
          {explanation.target !== null ? (
            <li className="flex justify-between gap-4 text-graphite">
              <span>Target</span>
              <span className="font-mono tabular-nums">{explanation.target}</span>
            </li>
          ) : null}
        </ul>
      </div>
    );
  }

  return (
    <div className={className} data-explanation-mode="non-arithmetic">
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-graphite">
        Why the count alone is not the answer
      </p>
      <dl className="mt-3 space-y-2 text-sm">
        {explanation.rawObserved !== null ? (
          <div className="flex justify-between gap-4">
            <dt>Raw bookings recorded</dt>
            <dd className="font-mono tabular-nums">{explanation.rawObserved}</dd>
          </div>
        ) : null}
        {explanation.target !== null ? (
          <div className="flex justify-between gap-4">
            <dt>Declared target</dt>
            <dd className="font-mono tabular-nums">{explanation.target}</dd>
          </div>
        ) : null}
      </dl>

      {explanation.observations.length ? (
        <>
          <p className="mt-4 text-sm font-medium">Eligibility issues recorded in evidence</p>
          <ul className="mt-2 space-y-2 text-sm">
            {explanation.observations.map((observation, index) => (
              <li key={`${observation.label}-${index}`} className="border-l-2 border-ochre pl-3">
                <span className="flex flex-wrap items-baseline gap-2">
                  <span>{observation.label}</span>
                  {observation.quantity !== null ? (
                    <Badge tone="warning">{observation.quantity} recorded</Badge>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs text-graphite">{observation.detail}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {explanation.guardrails.length ? (
        <>
          <p className="mt-4 text-sm font-medium">Guardrails that govern eligibility</p>
          <ul className="mt-2 space-y-1 text-sm">
            {explanation.guardrails.map((guardrail) => (
              <li key={`${guardrail.kind}-${guardrail.text}`} className="flex gap-2">
                <Badge tone={guardrail.kind === "MUST" ? "danger" : "success"}>{guardrail.kind}</Badge>
                <span>{guardrail.text}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="mt-4 text-sm text-graphite">
        These populations may overlap, so the evidence does not support subtracting them into a
        single eligible total. The authoritative finding below is the contract&rsquo;s decision.
      </p>

      <div className="mt-4 border-t border-rule pt-3">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Authoritative contract finding:</span>
          <Badge tone={explanation.reached ? "success" : "danger"}>
            Metric target reached: {explanation.reached === null ? "unknown" : explanation.reached ? "Yes" : "No"}
          </Badge>
        </p>
      </div>
    </div>
  );
}
