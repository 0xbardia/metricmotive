import { useState } from "react";
import { cn } from "@/lib/cn";
import { shortHex } from "@/lib/format";

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
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex min-h-11 max-w-full items-center gap-2 rounded-sm font-mono text-xs tracking-tight",
        className,
      )}
      aria-label={`Copy ${label}`}
    >
      <span className="min-w-0 truncate">{compact ? shortHex(value, 6) : value}</span>
      <span className="shrink-0 text-[0.65rem] uppercase tracking-[0.12em] text-ochre">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
