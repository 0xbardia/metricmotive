import { cn } from "@/lib/cn";
import { roleClass, verdictCopyFor, type TokenRole } from "@/lib/tokens";

/** Legacy tone names kept so existing call sites keep working. */
export type BadgeTone = "graphite" | "ochre" | "sage" | "brick" | "ink" | TokenRole;

const tones: Record<string, TokenRole> = {
  graphite: "neutral",
  ochre: "brand",
  sage: "success",
  brick: "danger",
  ink: "neutral",
  neutral: "neutral",
  info: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
  brand: "brand",
  "verdict-faithful": "verdict-faithful",
  "verdict-partial": "verdict-partial",
  "verdict-gaming": "verdict-gaming",
  "verdict-insufficient": "verdict-insufficient",
};

const inkOverride = "bg-carbon text-bone";

export function Badge({
  tone = "graphite",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: BadgeTone }) {
  const role = tones[tone] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-[0.08em]",
        tone === "ink" ? inkOverride : roleClass(role),
        className,
      )}
      {...props}
    />
  );
}

/**
 * Verdict badge. Prefer `VerdictBadge` from `@/components/ui/verdict-badge`,
 * which also renders a glyph so meaning does not rely on colour.
 */
export function VerdictStamp({ verdict }: { verdict: string | null | undefined }) {
  const known = verdict && verdict in VERDICT_LABELS;
  if (!known) {
    const fallback: Record<string, { tone: BadgeTone; label: string }> = {
      DRAFT: { tone: "graphite", label: "Draft" },
      ARMED: { tone: "graphite", label: "Locked" },
      EVIDENCE_SUBMITTED: { tone: "graphite", label: "Evidence committed" },
      RESOLVED: { tone: "graphite", label: "Resolved" },
    };
    const item = (verdict && fallback[verdict]) || { tone: "graphite" as const, label: verdict ?? "—" };
    return <Badge tone={item.tone}>{item.label}</Badge>;
  }
  const copy = verdictCopyFor(verdict as keyof typeof VERDICT_LABELS);
  return (
    <Badge tone={copy.role}>
      <span aria-hidden="true" className="mr-1">
        {copy.glyph}
      </span>
      {copy.label}
    </Badge>
  );
}

const VERDICT_LABELS = {
  FAITHFUL_SUCCESS: true,
  METRIC_GAMING: true,
  PARTIAL_ALIGNMENT: true,
  INSUFFICIENT_EVIDENCE: true,
} as const;
