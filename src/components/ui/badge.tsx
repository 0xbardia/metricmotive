import { cn } from "@/lib/cn";

const tones = {
  graphite: "bg-cream text-graphite",
  ochre: "bg-ochre-soft text-carbon",
  sage: "bg-sage-soft text-carbon",
  brick: "bg-brick-soft text-carbon",
  ink: "bg-carbon text-bone",
} as const;

export function Badge({
  tone = "graphite",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-[0.08em]",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function VerdictStamp({
  verdict,
}: {
  verdict: string | null | undefined;
}) {
  const map: Record<string, { tone: keyof typeof tones; label: string }> = {
    FAITHFUL_SUCCESS: { tone: "sage", label: "Faithful success" },
    METRIC_GAMING: { tone: "brick", label: "Metric gaming" },
    PARTIAL_ALIGNMENT: { tone: "ochre", label: "Partial alignment" },
    INSUFFICIENT_EVIDENCE: { tone: "graphite", label: "Insufficient evidence" },
    DRAFT: { tone: "graphite", label: "Draft" },
    ARMED: { tone: "ochre", label: "Armed" },
    EVIDENCE_SUBMITTED: { tone: "ochre", label: "Evidence submitted" },
    RESOLVED: { tone: "ink", label: "Resolved" },
  };
  const item = (verdict && map[verdict]) || { tone: "graphite" as const, label: verdict ?? "—" };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}
