import { cn } from "@/lib/cn";

export function DivergenceMark({
  className,
  invert = false,
}: {
  className?: string;
  invert?: boolean;
}) {
  const bg = invert ? "var(--color-bone)" : "var(--color-carbon)";
  const metric = "var(--color-ochre)";
  const motive = invert ? "var(--color-carbon)" : "var(--color-sage)";
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8", className)}
      role="img"
      aria-label="MetricMotive"
    >
      <rect width="32" height="32" rx="7" style={{ fill: bg }} />
      <path
        d="M9 25 C11.5 18 11.5 12 10 6"
        fill="none"
        style={{ stroke: metric }}
        strokeWidth="3.25"
        strokeLinecap="round"
      />
      <path
        d="M9 25 C16 19 21 13 25 7"
        fill="none"
        style={{ stroke: motive }}
        strokeWidth="3.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark({ invert = false, className }: { invert?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <DivergenceMark invert={invert} className="wordmark-mark size-8 shrink-0" />
      <span
        className={cn(
          "font-display text-xl font-semibold tracking-tight",
          invert ? "text-bone" : "text-carbon",
        )}
      >
        MetricMotive
      </span>
    </span>
  );
}
