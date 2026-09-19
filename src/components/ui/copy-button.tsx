import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Accessible copy control with visible confirmation (H4).
 * Feedback is announced politely and the full value stays available to
 * assistive tech even when the visible text is truncated.
 */
export function CopyButton({
  value,
  label,
  className,
  compact = false,
}: {
  value: string;
  /** Human name of the value, e.g. "transaction hash". */
  label: string;
  className?: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "unavailable">("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(() => {
    setState("idle");
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setState("unavailable");
      timer.current = window.setTimeout(() => setState("idle"), 1800);
      return;
    }
    void navigator.clipboard.writeText(value).then(
      () => {
        setState("copied");
        timer.current = window.setTimeout(() => setState("idle"), 1600);
      },
      () => {
        setState("unavailable");
        timer.current = window.setTimeout(() => setState("idle"), 1800);
      },
    );
  }, [value]);

  const feedback = state === "copied" ? "Copied!" : state === "unavailable" ? "Copy unavailable" : null;

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm px-1.5 text-graphite transition-colors hover:text-carbon",
        compact && "min-h-8",
        className,
      )}
      aria-label={feedback ? `${feedback} ${label}` : `Copy ${label}`}
    >
      {state === "copied" ? (
        <Check className="size-3.5 text-sage" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
      <span className="text-[0.625rem] uppercase tracking-[0.12em]" aria-hidden="true">
        {feedback ?? "Copy"}
      </span>
      <span aria-live="polite" className="sr-only">
        {feedback ?? ""}
      </span>
    </button>
  );
}
