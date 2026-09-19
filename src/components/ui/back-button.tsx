import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * THE back affordance (N7).
 *
 * Back links were plain underlined text with no hit area, so on touch they were
 * nearly impossible to hit and they carried no visible focus ring. This is one
 * 44px control with a real link role, hover state and keyboard focus.
 *
 * Two honest forms, because "back" is sometimes a route and sometimes a step:
 * `to` navigates, `onClick` steps the surrounding flow. A link is rendered for
 * the first (so it can be opened in a new tab) and a button for the second.
 */
type BaseProps = {
  /** Verb-led label, e.g. "Back to Review" — never a bare "Back". */
  label: string;
  className?: string;
};

const CLASSES =
  "inline-flex min-h-11 items-center gap-2 rounded-sm px-2 -ml-2 text-sm text-graphite transition-colors hover:text-carbon focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre";

export function BackButton(
  props: BaseProps & ({ to: string; params?: Record<string, string> } | { to?: never; onClick: () => void }),
): ReactNode {
  const { label, className } = props;

  if (props.to !== undefined) {
    return (
      <Link
        // Route ids are dynamic; the router validates them at call sites.
        to={props.to as never}
        params={props.params as never}
        className={cn(CLASSES, className)}
        data-action="back"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
        {label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={props.onClick} className={cn(CLASSES, className)} data-action="back">
      <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </button>
  );
}
