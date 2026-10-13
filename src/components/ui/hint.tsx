import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A term with a one-line plain-language gloss. Keyboard and touch friendly (a real button, Esc closes, the gloss is
 * in the page flow, not a hover-only tooltip). Use for the few protocol words that must stay visible.
 */
export function Hint({ term, children, className }: { term: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={cn("inline", className)}>
      {term}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label="What does this mean?"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        className="relative ml-1 inline-grid size-5 translate-y-px place-items-center rounded-full border border-border-strong text-[0.6875rem] leading-none text-graphite before:absolute before:-inset-3 before:content-[''] hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
      >
        <span aria-hidden="true">?</span>
      </button>
      {open ? (
        <span id={id} role="note" className="mt-1 block max-w-prose text-sm font-normal normal-case leading-relaxed tracking-normal text-graphite">
          {children}
        </span>
      ) : null}
    </span>
  );
}
