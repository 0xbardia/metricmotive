import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Reveal } from "@/components/motion";
import { Button } from "@/components/ui/button";

export function LoopholeScanSection() {
  const [protectedSpec, setProtectedSpec] = useState(false);

  return (
    <section id="stress-test" className="bg-cream text-carbon">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="scan-heading flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-graphite">
              03 — Stress-test
            </p>
            <h2 className="mt-3 max-w-2xl font-display text-4xl tracking-tight">
              Find the loophole before the agent does.
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <button
              type="button"
              className="scan-toggle min-h-11 border-b border-carbon/35 pb-1 font-mono text-[0.65rem] uppercase tracking-[0.12em]"
              aria-pressed={protectedSpec}
              onClick={() => setProtectedSpec((value) => !value)}
            >
              {protectedSpec ? "Reopen the loophole" : "Apply the guardrail"}
            </button>
          </Reveal>
        </div>

        <div className="scan-board mt-10" data-protected={protectedSpec}>
          <div className="scan-board-header flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-4">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-graphite">
              Specification review / Guard #2
            </p>
            <p
              className="scan-status font-mono text-[0.65rem] uppercase tracking-[0.12em]"
              aria-live="polite"
            >
              {protectedSpec ? "Specification strengthened" : "Loophole open"}
            </p>
          </div>

          <ol className="scan-trace mt-2">
            <Reveal as="li" delay={40} className="scan-trace-row">
              <span className="scan-trace-index font-mono text-xs text-graphite">01</span>
              <div>
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-graphite">
                  Before lock
                </p>
                <div className="scan-code-line mt-3">
                  <code>Book 80 meetings this week.</code>
                  <span className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-graphite">
                    metric
                  </span>
                </div>
                <p className="mt-3 text-sm text-graphite">Measurable. Boundaries still implicit.</p>
              </div>
            </Reveal>
            <Reveal as="li" delay={100} className="scan-trace-row scan-trace-exploit">
              <span className="scan-trace-index font-mono text-xs text-ochre">02</span>
              <div>
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-ochre">
                  Exploit discovered
                </p>
                <p className="mt-3 max-w-xl font-display text-2xl leading-tight">
                  Bookings can increase by targeting low-quality prospects.
                </p>
                <p className="mt-3 text-sm text-graphite">
                  Duplicates, out-of-ICP leads, and misleading invites all make the number move.
                </p>
              </div>
            </Reveal>
            <Reveal as="li" delay={160} className="scan-trace-row scan-trace-protection">
              <span className="scan-trace-index font-mono text-xs text-[var(--color-sage-text)]">03</span>
              <div className="min-w-0">
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-[var(--color-sage-text)]">
                  Protection
                </p>
                <p className="mt-3 max-w-xl font-display text-2xl leading-tight">
                  The motive becomes executable.
                </p>
                <ul
                  className="guardrail-list mt-4"
                  aria-label="Guardrails added to the specification"
                >
                  <li>
                    <span>ICP_MATCH</span>
                    <b>MUST</b>
                    <em>declared ICP</em>
                  </li>
                  <li>
                    <span>UNIQUE_PROSPECT</span>
                    <b>MUST</b>
                    <em>one domain, one count</em>
                  </li>
                  <li>
                    <span>HONEST_OUTREACH</span>
                    <b>MUST</b>
                    <em>no misleading invite</em>
                  </li>
                </ul>
              </div>
            </Reveal>
          </ol>

          <div className="scan-board-footer mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-4">
            <p className="text-sm text-graphite">Add the rails before the result exists.</p>
            <Link to="/app/guards/new">
              <Button size="sm" variant="outline">
                Create a Motive Guard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
