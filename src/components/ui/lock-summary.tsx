import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import type { Guardrail } from "@/lib/domain";
import { GENLAYER } from "@/lib/domain";

/**
 * Immutable payload summary shown before a wallet lock (S3 / M5).
 *
 * It shows exactly what the lock freezes, plus the network the transaction
 * runs on. No fee estimate is shown: GenLayer Studio Dev exposes no reliable
 * equivalent, so we say so rather than invent a number.
 */
export function LockSummary({
  motive,
  metric,
  guardrails,
  definitionHash,
  locked = false,
  className,
}: {
  motive: string;
  metric: string;
  guardrails: Guardrail[];
  definitionHash?: string | null;
  /** True only once the lock is authoritative (N5 / N13). */
  locked?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dl className="grid gap-4 md:grid-cols-2">
        <div className="border-t-2 border-sage pt-3">
          <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-sage">
            Motive · {locked ? "frozen" : "to be frozen"}
          </dt>
          <dd className="mt-2 text-base leading-snug">{motive || "—"}</dd>
        </div>
        <div className="border-t-2 border-ochre pt-3">
          <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-ochre">
            Metric · {locked ? "frozen" : "to be frozen"}
          </dt>
          <dd className="mt-2 text-base leading-snug">{metric || "—"}</dd>
        </div>
      </dl>

      <div className="mt-5">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-graphite">
          Guardrails · {locked ? "frozen" : "to be frozen"}
        </p>
        {guardrails.length ? (
          <ul className="mt-2 space-y-2">
            {guardrails.map((guardrail) => (
              <li key={`${guardrail.kind}-${guardrail.text}`} className="flex gap-2 text-sm">
                <Badge tone={guardrail.kind === "MUST" ? "danger" : "success"}>{guardrail.kind}</Badge>
                <span>{guardrail.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-graphite">No guardrails recorded.</p>
        )}
      </div>

      <dl className="mt-5 grid gap-3 border-t border-rule pt-4 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3">
          <dt className="text-graphite">Network</dt>
          <dd>{GENLAYER.network}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-graphite">Chain ID</dt>
          <dd className="font-mono tabular-nums">{GENLAYER.chainId}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <dt className="text-graphite">Cost</dt>
          <dd>Network transaction required</dd>
        </div>
        {definitionHash ? (
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <dt className="text-graphite">Definition fingerprint</dt>
            <dd className="flex min-w-0 items-center gap-1">
              <span className="truncate font-mono text-xs">{definitionHash}</span>
              <CopyButton value={definitionHash} label="definition fingerprint" compact />
            </dd>
          </div>
        ) : null}
      </dl>
      {definitionHash ? (
        <p className="mt-2 text-xs text-graphite">
          {locked
            ? "This definition fingerprint is finalized for this Guard version."
            : "This fingerprint identifies the published definition. Locking makes this version immutable."}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Compact provenance chain: Capture → Canonicalize → Hash → Commit → Verify (S5 / N19).
 *
 * The stages are genuinely sequential, so each one is reported on its own
 * evidence rather than being derived from a single `committed` flag: a finished
 * Run has already been captured, canonicalized and hashed, and only then waits
 * on Commit. Collapsing Canonicalize/Hash into Commit told users those steps
 * were pending when the manifest and its digest already existed.
 */
export function ProvenanceChain({
  captured = true,
  canonicalized = false,
  hashed = false,
  committed,
  verified,
  className,
}: {
  /** Events exist for this Run. */
  captured?: boolean;
  /** The canonical manifest has been built (true for any FINISHED Run). */
  canonicalized?: boolean;
  /** The manifest digest exists. */
  hashed?: boolean;
  committed: boolean;
  verified: boolean;
  className?: string;
}) {
  const steps = [
    { label: "Capture", done: captured },
    { label: "Canonicalize", done: canonicalized || committed },
    { label: "Hash", done: hashed || committed },
    { label: "Commit", done: committed },
    { label: "Verify", done: verified },
  ];
  return (
    <ol className={className} aria-label="Evidence provenance">
      {steps.map((step) => (
        <li key={step.label} data-state={step.done ? "done" : "pending"}>
          <span aria-hidden="true">{step.done ? "✓" : "○"}</span> {step.label}
          <span className="sr-only"> {step.done ? "complete" : "pending"}</span>
        </li>
      ))}
    </ol>
  );
}
