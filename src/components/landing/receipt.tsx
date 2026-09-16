import { Link } from "@tanstack/react-router";
import { Reveal } from "@/components/motion";
import { CopyValue } from "@/components/landing/copy-value";
import { HOSTED_GAMING } from "@/components/landing/cert-case";
import { Badge, VerdictStamp } from "@/components/ui/badge";
import { LEGACY_DEPLOYMENT } from "@/lib/contract";

export function ReceiptSection() {
  return (
    <section id="receipt" className="bg-cream text-carbon">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Reveal>
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-graphite">
              06 — Understand
            </p>
            <h2 className="mt-3 font-display text-4xl tracking-tight">Motive Receipt</h2>
            <p className="mt-3 max-w-xl text-sm text-graphite">{HOSTED_GAMING.disclaimer}</p>
          </Reveal>
          <Reveal
            delay={80}
            className="receipt-heading-meta text-right font-mono text-[0.62rem] uppercase tracking-[0.12em] text-graphite"
          >
            Guard #{HOSTED_GAMING.guardId}
            <br />
            Resolved on Studionet
          </Reveal>
        </div>
        <Reveal delay={80}>
          <article className="receipt-sheet mt-10">
            <div className="receipt-layout">
              <aside className="receipt-index">
                <Badge tone="ochre">Certification receipt</Badge>
                <p className="receipt-index-number mt-8 font-display">02</p>
                <p className="mt-2 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-graphite">
                  Hosted case
                </p>
                <p className="mt-6 text-sm text-graphite">
                  A public example of a number succeeding while the motive fails.
                </p>
              </aside>
              <div className="receipt-body">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-4">
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-graphite">
                    Adjudication complete
                  </p>
                  <VerdictStamp verdict={HOSTED_GAMING.verdict} />
                </header>
                <dl className="mt-6 grid gap-6 sm:grid-cols-2">
                  <div>
                    <dt>What was intended?</dt>
                    <dd className="mt-2 font-display text-xl">{HOSTED_GAMING.motiveShort}</dd>
                  </div>
                  <div>
                    <dt>What was measured?</dt>
                    <dd className="mt-2 font-display text-xl">{HOSTED_GAMING.metric}</dd>
                  </div>
                  <div>
                    <dt>What happened?</dt>
                    <dd className="mt-2 text-sm leading-relaxed">
                      {HOSTED_GAMING.counts.meetings} meetings · {HOSTED_GAMING.counts.qualified}{" "}
                      qualified · {HOSTED_GAMING.counts.duplicates} duplicates ·{" "}
                      {HOSTED_GAMING.counts.outsideIcp} outside ICP ·{" "}
                      {HOSTED_GAMING.counts.misleading} misleading
                    </dd>
                  </div>
                  <div>
                    <dt>What did GenLayer find?</dt>
                    <dd className="mt-2 text-sm leading-relaxed">
                      {HOSTED_GAMING.primaryPattern}. Metric satisfied. Goal not advanced. Material
                      violation.
                    </dd>
                  </div>
                </dl>
                <div className="receipt-finding-line mt-7">
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-graphite">
                    Findings
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[0.68rem] uppercase tracking-[0.08em]">
                    <li className="text-sage">metric_satisfied</li>
                    <li className="text-brick">goal_not_advanced</li>
                    <li className="text-brick">material_violation</li>
                    <li className="text-brick">constraint_bypass</li>
                  </ul>
                </div>
                <p className="mt-7 font-display text-3xl text-brick">{HOSTED_GAMING.verdict}</p>
              </div>
            </div>
            <div className="receipt-proof mt-8 grid gap-3 border-t border-rule pt-4 font-mono text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-graphite">Contract</span>
                <CopyValue value={LEGACY_DEPLOYMENT.contractAddress} label="contract" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-graphite">Evidence fingerprint</span>
                <CopyValue value={HOSTED_GAMING.evidenceHash} label="fingerprint" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-graphite">Evaluate tx</span>
                <CopyValue value={HOSTED_GAMING.evaluateTx} label="evaluate transaction" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-graphite">Guard ID</span>
                <span>#{HOSTED_GAMING.guardId}</span>
              </div>
            </div>
            <Link
              to="/verify/$receiptId"
              params={{ receiptId: "rct_example_sales" }}
              className="mt-6 inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
            >
              Open the public receipt
            </Link>
          </article>
        </Reveal>
      </div>
    </section>
  );
}
