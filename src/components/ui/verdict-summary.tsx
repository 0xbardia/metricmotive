import { VerdictBadge } from "@/components/ui/verdict-badge";
import { cn } from "@/lib/cn";
import { VERDICT_MEANING } from "@/lib/terminology";
import type { Verdict } from "@/lib/domain";

/**
 * THE way a verdict is shown, everywhere (guard, run, receipt, demo): one badge and one sentence of meaning, for
 * all four verdicts. Colour is never the only signal (the badge carries a glyph and a label).
 */
export function VerdictSummary({
  verdict,
  size = "lg",
  tone = "light",
  className,
}: {
  verdict: Verdict | string | null | undefined;
  size?: "sm" | "lg";
  /** "dark" for carbon surfaces. */
  tone?: "light" | "dark";
  className?: string;
}) {
  const meaning = verdict && verdict in VERDICT_MEANING ? VERDICT_MEANING[verdict as Verdict] : "No verdict yet. A verdict appears after the evidence is committed and checked.";
  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <VerdictBadge verdict={verdict} size={size} />
      <p className={cn("max-w-prose text-base leading-relaxed", tone === "dark" ? "text-bone/90" : "text-graphite")}>{meaning}</p>
    </div>
  );
}
