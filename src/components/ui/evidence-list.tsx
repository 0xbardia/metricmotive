import { TechnicalDetails } from "@/components/product-ui";
import { IdBadge } from "@/components/ui/id-badge";
import type { RunEvent } from "@/lib/domain";
import { evidenceEventSummary } from "@/lib/evidence-summary";

/**
 * THE canonical evidence list (H7).
 *
 * Exactly one surface renders the full event list. Adjacent cards use
 * <EvidenceSummary /> instead of repeating it.
 */
export function EvidenceList({
  events,
  ariaLabel = "Run evidence timeline",
  heading,
  className,
}: {
  events: RunEvent[];
  ariaLabel?: string;
  heading?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {heading ? <h3 className="font-display text-2xl">{heading}</h3> : null}
      <ul className="evidence-summary-list mt-4" aria-label={ariaLabel}>
        {events.map((event, index) => (
          <li key={`${event.timestamp}-${index}`}>
            <time dateTime={event.timestamp}>{event.timestamp.slice(11, 16)} UTC</time>
            <p>
              <span className="font-medium">{evidenceEventSummary(event)}</span>
              <span className="mt-1 block text-xs text-graphite">Source: {event.source}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Counts plus a pointer to the canonical list. Never repeats the events.
 */
export function EvidenceSummary({
  events,
  runId,
  guardId,
  className,
}: {
  events: RunEvent[];
  runId?: string;
  guardId?: string | null;
  className?: string;
}) {
  const sourceCounts = events.reduce<Record<string, number>>((counts, event) => {
    counts[event.source] = (counts[event.source] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <div className={className}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-graphite">Captured events</dt>
          <dd className="mt-1 font-display text-2xl tabular-nums">{events.length}</dd>
        </div>
        <div>
          <dt className="text-graphite">Sources</dt>
          <dd className="mt-1">
            <ul className="space-y-0.5">
              {Object.entries(sourceCounts).map(([name, count]) => (
                <li key={name} className="flex justify-between gap-3">
                  <span className="capitalize">{name}</span>
                  <span className="font-mono">{count}</span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
      {runId || guardId ? (
        <TechnicalDetails className="mt-4" title="Evidence integrity">
          <dl>
            {runId ? (
              <div>
                <dt>Run ID</dt>
                <dd>
                  <IdBadge value={runId} kind="run" />
                </dd>
              </div>
            ) : null}
            {guardId ? (
              <div>
                <dt>Guard ID</dt>
                <dd>
                  <IdBadge value={guardId} kind="guard" />
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Captured events</dt>
              <dd>{events.length}</dd>
            </div>
          </dl>
        </TechnicalDetails>
      ) : null}
    </div>
  );
}
