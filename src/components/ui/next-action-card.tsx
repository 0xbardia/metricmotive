import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { LifecyclePresentation } from "@/lib/lifecycle";

/**
 * The required next action, surfaced inside the state card (C0).
 *
 * The action itself is produced by the lifecycle model, so a route cannot
 * invent its own next-step prose. Optional affordances (Motive Drift,
 * counterfactual review) are rendered separately and visually demoted below.
 */
export function NextActionCard({
  lifecycle,
  children,
}: {
  lifecycle: LifecyclePresentation;
  /** The actual control(s) that perform `nextAction`. */
  children: ReactNode;
}) {
  const { nextAction, protocolLabel, optionalActions } = lifecycle;
  return (
    <section
      className="product-status paper-panel p-6"
      data-tone={lifecycle.stage === "RESOLVED" ? "sage" : undefined}
      aria-labelledby="current-state-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.15em] text-graphite">
            {protocolLabel}
          </p>
          <h2 id="current-state-title" className="mt-2 font-display text-3xl tracking-tight">
            {lifecycle.headline}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">{lifecycle.body}</p>
        </div>
      </div>

      <div className="mt-6 border-t border-rule pt-5">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-graphite">
          Next action
        </p>
        <div className="mt-3">{children}</div>
        <p className="mt-3 max-w-2xl text-sm text-graphite">{nextAction.description}</p>
      </div>

      {optionalActions.length ? (
        <div className="mt-5 border-t border-rule pt-4">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.13em] text-graphite">
            Optional
          </p>
          <ul className="mt-2 space-y-1">
            {optionalActions.map((action) => (
              <li key={action.label} className="text-sm text-graphite">
                {action.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function StateBadge({ label, tone = "graphite" }: { label: string; tone?: "graphite" | "sage" | "brick" | "ochre" }) {
  return <Badge tone={tone}>{label}</Badge>;
}
