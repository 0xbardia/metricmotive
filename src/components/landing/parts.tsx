import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/cn";
import { D1 } from "@/lib/d1-case";

const BTN =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ochre";
const VARIANT = {
  solid: "bg-carbon text-bone hover:bg-carbon/90",
  ochre: "bg-ochre text-carbon hover:bg-ochre/90",
  outline: "border border-border-strong text-carbon hover:bg-carbon/5",
  "outline-dark": "border border-bone text-bone hover:bg-bone/10",
} as const;

/** Internal link styled as a button (anchor, not a nested <button>). */
export function ButtonLink({ to, variant, children }: { to: string; variant: keyof typeof VARIANT; children: ReactNode }) {
  return (
    <Link to={to} className={cn(BTN, VARIANT[variant])}>
      {children}
    </Link>
  );
}

/** Text link to the contract on the explorer; opens a new tab and says so. */
export function LiveLink({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <a
      href={D1.explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ochre",
        dark ? "text-ochre" : "text-brand-text",
        className,
      )}
    >
      live on-chain
      <ExternalLink className="size-3.5" aria-hidden="true" />
      <span className="sr-only">(opens the contract on the explorer in a new tab)</span>
    </a>
  );
}

export function TextLink({ to, dark = false, children }: { to: string; dark?: boolean; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ochre",
        dark ? "text-ochre" : "text-brand-text",
      )}
    >
      {children}
    </Link>
  );
}

export function Kicker({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <p className={cn("font-mono text-xs uppercase tracking-[0.16em]", dark ? "text-ochre" : "text-brand-text")}>{children}</p>
  );
}

export const SECTION = "mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20";
export const H2 = "mt-3 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl";
