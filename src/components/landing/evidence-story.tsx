import { useState } from "react";
import { Reveal } from "@/components/motion";
import { CopyValue } from "@/components/landing/copy-value";
import { HOSTED_GAMING } from "@/components/landing/cert-case";
import { cn } from "@/lib/cn";

export function EvidenceStorySection() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = HOSTED_GAMING.timeline[selectedIndex];

  return (
    <section id="use-cases" className="bg-bone text-carbon">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Reveal>
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-graphite">
              04 — Capture
            </p>
            <h2 className="mt-3 font-display text-4xl tracking-tight">
              Evidence accumulates in order.
            </h2>
            <p className="mt-3 max-w-xl text-sm text-graphite">{HOSTED_GAMING.disclaimer}</p>
          </Reveal>
          <Reveal delay={80} className="run-count text-right">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.13em] text-graphite">
              Observed run
            </p>
            <p className="mt-1 font-mono text-lg">
              {HOSTED_GAMING.timeline.length} events / 1 verdict
            </p>
          </Reveal>
        </div>
        <div className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="run-summary grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
              <div>
                <span>Booked</span>
                <strong>{HOSTED_GAMING.counts.meetings}</strong>
              </div>
              <div>
                <span>Qualified</span>
                <strong className="text-[var(--color-sage-text)]">{HOSTED_GAMING.counts.qualified}</strong>
              </div>
              <div>
                <span>Duplicates</span>
                <strong className="text-[var(--color-danger-text)]">{HOSTED_GAMING.counts.duplicates}</strong>
              </div>
              <div>
                <span>Outside ICP</span>
                <strong className="text-[var(--color-danger-text)]">{HOSTED_GAMING.counts.outsideIcp}</strong>
              </div>
            </div>
            <ol className="run-timeline" aria-label="Certification run timeline">
              {HOSTED_GAMING.timeline.map((event, i) => (
                <Reveal
                  key={`${event.t}-${event.title}`}
                  delay={i * 50}
                  as="li"
                  className="run-event"
                >
                  <button
                    type="button"
                    className={cn("run-event-button", selectedIndex === i && "is-selected")}
                    aria-pressed={selectedIndex === i}
                    onClick={() => setSelectedIndex(i)}
                  >
                    <time className="font-mono text-[0.7rem] text-graphite">{event.t}</time>
                    <span className="run-event-copy">
                      <span
                        className={cn(
                          "run-event-title",
                          event.kind === "fault"
                            ? "text-[var(--color-danger-text)]"
                            : event.kind === "motive"
                              ? "text-[var(--color-sage-text)]"
                              : "text-carbon",
                        )}
                      >
                        {event.title}
                      </span>
                      <span className="text-sm text-graphite">{event.note}</span>
                    </span>
                    <span className="run-event-action font-mono text-[0.6rem] uppercase tracking-[0.1em]">
                      Inspect evidence
                    </span>
                  </button>
                </Reveal>
              ))}
            </ol>
            <div className="run-event-detail mt-4" aria-live="polite">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-graphite">
                Evidence fragment / {selected.t}
              </p>
              <p className="mt-2 text-sm text-carbon">
                {selected.note} {selected.title}.
              </p>
            </div>
          </div>
          <Reveal delay={80} as="aside" className="manifest">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-graphite">
              Evidence Manifest
            </p>
            <dl className="mt-4 space-y-3 font-mono text-xs">
              <div>
                <dt className="text-graphite">Fingerprint</dt>
                <dd className="mt-1">
                  <CopyValue value={HOSTED_GAMING.evidenceHash} label="evidence fingerprint" />
                </dd>
              </div>
              <div>
                <dt className="text-graphite">Source</dt>
                <dd className="mt-1">Hosted sales certification run</dd>
              </div>
              <div>
                <dt className="text-graphite">Events</dt>
                <dd className="mt-1">
                  {HOSTED_GAMING.timeline.length} recorded steps · {HOSTED_GAMING.counts.misleading}{" "}
                  misleading cases
                </dd>
              </div>
              <div>
                <dt className="text-graphite">Provenance</dt>
                <dd className="mt-1">Committed before evaluation. Cannot be swapped.</dd>
              </div>
            </dl>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
