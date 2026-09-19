import { cn } from "@/lib/cn";
import { CopyButton } from "@/components/ui/copy-button";
import { midEllipsis } from "@/lib/format";

/**
 * Landing-facing identifier row.
 *
 * Thin wrapper over the shared <CopyButton /> so landing identifiers truncate,
 * copy and give feedback exactly like app identifiers (root cause D: IDs must
 * not be shortened or reproduced independently per surface).
 */
export function CopyValue({
  value,
  label,
  compact = true,
  className,
}: {
  value: string;
  label: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 max-w-full items-center gap-2", className)}>
      <span className="min-w-0 truncate font-mono text-xs tracking-tight" title={value}>
        {compact ? midEllipsis(value) : value}
      </span>
      <span className="sr-only">{value}</span>
      <CopyButton value={value} label={label} compact />
    </span>
  );
}
