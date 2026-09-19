import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IdBadge } from "@/components/ui/id-badge";

/**
 * The single canonical "evidence committed" state (Phase 12).
 *
 * Replaces the set of controls that used to coexist here — Retry confirmation,
 * Needs attention, Commit evidence and confirmation delayed — with one card
 * that states the finalized fact and offers only the next lifecycle step.
 */
export function EvidenceCommittedCard({
  guardId,
  eventCount,
  txEvidence,
  manifestHash,
  provenance,
}: {
  guardId: string;
  eventCount: number;
  txEvidence: string | null;
  manifestHash: string | null;
  provenance?: { contractAddress?: string | null; chainId?: number | null };
}) {
  return (
    <section
      className="product-status paper-panel p-6"
      data-tone="sage"
      aria-labelledby="evidence-committed-title"
    >
      <Badge tone="success">Finalized</Badge>
      <p className="mt-3 font-mono text-[0.6875rem] uppercase tracking-[0.15em] text-graphite">
        Evidence committed
      </p>
      <h2 id="evidence-committed-title" className="mt-2 font-display text-3xl tracking-tight">
        {eventCount} {eventCount === 1 ? "event" : "events"} committed to GenLayer.
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">
        The evidence fingerprint is finalized on-chain. The commitment cannot be replaced or resubmitted.
      </p>
      {txEvidence || manifestHash ? (
        <dl className="mt-5 grid gap-3 border-t border-rule pt-4 text-sm sm:grid-cols-2">
          {txEvidence ? (
            <div>
              <dt className="text-graphite">Transaction</dt>
              <dd className="mt-1"><IdBadge value={txEvidence} kind="tx" provenance={provenance} label="evidence transaction" /></dd>
            </div>
          ) : null}
          {manifestHash ? (
            <div>
              <dt className="text-graphite">Evidence fingerprint</dt>
              <dd className="mt-1"><IdBadge value={manifestHash} kind="fingerprint" label="evidence fingerprint" /></dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <div className="mt-6 border-t border-rule pt-5">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-graphite">Next action</p>
        <div className="mt-3">
          <Link to="/app/guards/$id" params={{ id: guardId }}>
            <Button>Verify with GenLayer →</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
