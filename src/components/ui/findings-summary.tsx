import { TechnicalDetails } from "@/components/product-ui";
import { Badge } from "@/components/ui/badge";
import { humanReadableFindings, primaryPatternCopy, technicalFindings, hasMeaningfulPattern } from "@/lib/findings";
import type { Findings } from "@/lib/domain";
import type { GamingPattern } from "@/lib/domain";

const SIGNAL_TONE = {
  positive: "success",
  negative: "danger",
  neutral: "neutral",
} as const;

/**
 * Human-readable findings, used identically on Guard, verification and receipt.
 * Raw protocol fields live only inside Technical details (H0c).
 */
export function FindingsSummary({
  findings,
  pattern,
  heading = "Why GenLayer reached this result",
  className,
}: {
  findings: Findings;
  pattern?: GamingPattern | null;
  heading?: string;
  className?: string;
}) {
  const rows = humanReadableFindings(findings);
  return (
    <div className={className}>
      <h3 className="font-display text-2xl">{heading}</h3>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3 border-b border-rule py-3 text-sm">
            <dt>{row.label}</dt>
            <dd className="flex items-center gap-2">
              <Badge tone={SIGNAL_TONE[row.signal]}>{row.value}</Badge>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 text-sm">
        Primary pattern: <strong>{primaryPatternCopy(pattern)}</strong>
      </p>
      {hasMeaningfulPattern(pattern) ? (
        <p className="mt-1 text-sm text-graphite">
          The evidence identifies a meaningful divergence from the intended outcome.
        </p>
      ) : null}
      <TechnicalDetails className="mt-5" title="Technical findings">
        <pre className="overflow-x-auto whitespace-pre-wrap break-words bg-cream p-3 font-mono text-xs text-carbon">
          {technicalFindings(findings)}
        </pre>
      </TechnicalDetails>
    </div>
  );
}
