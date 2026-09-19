import { Badge } from "@/components/ui/badge";
import { verdictCopyFor, PROTOCOL_COPY, type ProtocolState } from "@/lib/tokens";
import type { Verdict } from "@/lib/domain";

const KNOWN_VERDICTS: Record<Verdict, true> = {
  FAITHFUL_SUCCESS: true,
  METRIC_GAMING: true,
  PARTIAL_ALIGNMENT: true,
  INSUFFICIENT_EVIDENCE: true,
};

/**
 * Result badge. Carries its own glyph and label so meaning never depends on
 * colour alone (L8 / accessibility).
 */
export function VerdictBadge({
  verdict,
  size = "sm",
}: {
  verdict: Verdict | string | null | undefined;
  size?: "sm" | "lg";
}) {
  if (!verdict || !(verdict in KNOWN_VERDICTS)) {
    return <Badge tone="graphite">No verdict yet</Badge>;
  }
  const copy = verdictCopyFor(verdict as Verdict);
  return (
    <Badge tone={copy.role} className={size === "lg" ? "px-3 py-1 text-xs" : undefined}>
      <span aria-hidden="true" className="mr-1">
        {copy.glyph}
      </span>
      {copy.label}
    </Badge>
  );
}

/**
 * Process/finality badge — deliberately neutral. GENLAYER FINALIZED is a
 * process fact, not a verdict, and must not share verdict styling (H8).
 */
export function ProtocolStatusBadge({ state }: { state: ProtocolState }) {
  const copy = PROTOCOL_COPY[state];
  return <Badge tone="graphite">{copy.label}</Badge>;
}
