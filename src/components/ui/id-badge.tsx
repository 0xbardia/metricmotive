import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { explorerTxUrl, type Provenance } from "@/lib/explorer";
import { midEllipsis } from "@/lib/format";
import { CopyButton } from "./copy-button";

export type IdKind =
  | "guard"
  | "run"
  | "wallet"
  | "contract"
  | "tx"
  | "fingerprint"
  | "manifest";

const KIND_LABEL: Record<IdKind, string> = {
  guard: "Guard ID",
  run: "Run ID",
  wallet: "wallet address",
  contract: "contract address",
  tx: "transaction hash",
  fingerprint: "fingerprint",
  manifest: "manifest hash",
};

/**
 * One consistent way to render every identifier (H4).
 *
 * Always monospace, always mid-ellipsis, always copyable, never independently
 * re-shortened per page. The untruncated value is exposed via title + sr-only
 * text so truncation never hides information.
 */
export function IdBadge({
  value,
  kind,
  label,
  provenance,
  className,
  inline = false,
  trailing,
}: {
  value: string;
  kind: IdKind;
  /** Overrides the default label, e.g. "Evaluate tx". */
  label?: string;
  /** Recorded provenance; keeps historical hashes on their historical network. */
  provenance?: Provenance;
  className?: string;
  inline?: boolean;
  trailing?: ReactNode;
}) {
  const text = value?.trim() || "—";
  const displayLabel = label ?? KIND_LABEL[kind];
  const href = kind === "tx" ? explorerTxUrl(text, provenance) : null;

  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 align-middle",
        !inline && "w-full",
        className,
      )}
    >
      <span className="min-w-0 truncate font-mono text-xs tracking-tight" title={text}>
        {midEllipsis(text)}
      </span>
      <span className="sr-only">{text}</span>
      {href ? <ExplorerLink href={href} /> : null}
      {text !== "—" ? <CopyButton value={text} label={displayLabel} compact /> : null}
      {trailing}
    </span>
  );
}

export function ExplorerLink({ href, label = "View on Explorer" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 text-[0.625rem] uppercase tracking-[0.12em] text-ochre underline-offset-4 hover:underline"
    >
      {label}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
