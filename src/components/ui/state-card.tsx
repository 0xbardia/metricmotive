import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * One shape for loading, empty and error states, so every surface answers the same three questions:
 * what is happening, why, and what to do next. Loading reserves its height (no layout shift when content arrives).
 * Text colours are the AA-safe tokens; `error` is announced (role="alert"), `loading` is a polite status.
 */
export function StateCard({
  kind,
  title,
  children,
  action,
  minHeight,
  className,
}: {
  kind: "loading" | "empty" | "error";
  title: string;
  /** What happened and, for errors, what to do next. */
  children?: ReactNode;
  /** The one next action (a Button or Link). */
  action?: ReactNode;
  /** Reserve space while loading, e.g. "12rem". */
  minHeight?: string;
  className?: string;
}) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      aria-busy={kind === "loading" ? true : undefined}
      style={minHeight ? { minHeight } : undefined}
      className={cn(
        "paper-panel p-6",
        kind === "error" && "border-l-4 border-l-danger-text",
        className,
      )}
    >
      <p className="font-display text-2xl tracking-tight">
        {kind === "loading" ? <span aria-hidden="true" className="mr-2 inline-block size-2 animate-pulse rounded-full bg-graphite" /> : null}
        {title}
      </p>
      {children ? <div className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
