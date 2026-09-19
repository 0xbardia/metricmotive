import { Reveal } from "@/components/motion";
import { HOSTED_GAMING } from "@/components/landing/cert-case";

export function DefineSection() {
  return (
    <section id="product" className="bg-bone text-carbon">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <Reveal>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-graphite">
            01 — Define
          </p>
          <h2 className="mt-3 max-w-2xl font-display text-4xl tracking-tight">
            Metric is measurable. Motive is what you actually want.
          </h2>
        </Reveal>
        <div className="define-comparison mt-12 border-t border-rule pt-10">
          <Reveal as="article" className="define-column define-column-motive">
            <div className="define-column-top">
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--color-sage-text)]">
                Motive
              </p>
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-graphite">
                Intent / durable
              </span>
            </div>
            <p className="mt-4 max-w-xl font-display text-3xl leading-tight tracking-tight">
              {HOSTED_GAMING.motiveShort}
            </p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-graphite">
              Unique. In ICP. Not misled. The work that would still count if nobody was watching the
              dashboard.
            </p>
          </Reveal>
          <div className="define-divider" aria-hidden="true">
            <span>≠</span>
          </div>
          <Reveal delay={80} as="article" className="define-column define-column-metric">
            <div className="define-column-top">
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--color-brand-text)]">
                Metric
              </p>
              <span className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-graphite">
                Measure / proxy
              </span>
            </div>
            <p className="mt-4 max-w-md font-display text-3xl leading-tight tracking-tight">
              {HOSTED_GAMING.metric}
            </p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-graphite">
              Countable. Cheap to game. Green when the calendar is full.
            </p>
          </Reveal>
        </div>
        <Reveal delay={120}>
          <p className="mt-12 font-display text-2xl text-[var(--color-danger-text)] sm:text-3xl">
            Those are not the same thing.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
