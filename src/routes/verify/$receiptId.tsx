import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/chrome";
import { TechnicalDetails } from "@/components/product-ui";
import { Badge } from "@/components/ui/badge";
import { FindingsSummary } from "@/components/ui/findings-summary";
import { IdBadge } from "@/components/ui/id-badge";
import { ProtocolStatusBadge, VerdictBadge } from "@/components/ui/verdict-badge";
import { contractProvenanceLabel } from "@/lib/explorer";
import { humanReadableFindings, primaryPatternCopy } from "@/lib/findings";
import { committedEvidenceLines } from "@/lib/evidence-summary";
import type { RunEvent } from "@/lib/domain";
import { verdictCopy, type Verdict } from "@/lib/domain";
import { getReceiptFn } from "@/lib/server/actions";
import { formatUtc } from "@/lib/format";
import { CTA } from "@/lib/terminology";

export const Route = createFileRoute("/verify/$receiptId")({
  component: ReceiptPage,
});

function ReceiptPage() {
  const { receiptId } = Route.useParams();
  const q = useQuery({
    queryKey: ["receipt", receiptId],
    queryFn: () => getReceiptFn({ data: { id: receiptId } }),
  });
  return (
    <div className="min-h-dvh bg-bone">
      <SiteHeader />
      {/*
        H0b: the receipt is the primary trust document, so it reads on a wide,
        comfortable shell rather than the narrowest column in the product.
      */}
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-16">
        {q.isLoading ? <p className="text-sm text-graphite">Loading receipt…</p> : null}
        {q.error ? (
          <div role="alert" className="paper-panel p-6">
            <p className="font-display text-2xl">
              {q.error instanceof Error && /not found/i.test(q.error.message)
                ? "This receipt does not exist."
                : q.error instanceof Error && /authentication|control|access/i.test(q.error.message)
                  ? "You don’t have access to this receipt."
                  : "We couldn’t load this receipt right now."}
            </p>
            <p className="mt-2 text-sm text-graphite">
              {q.error instanceof Error && /authentication|control|access/i.test(q.error.message)
                ? "This receipt is private until its Guard is finalized publicly."
                : "The recorded proof has not been changed. Try again."}
            </p>
            <button type="button" className="mt-4 min-h-11 text-sm underline-offset-4 hover:underline" onClick={() => void q.refetch()}>
              Try again
            </button>
          </div>
        ) : null}
        {q.data ? <ReceiptView data={q.data} /> : null}
      </main>
      <SiteFooter />
    </div>
  );
}

function ReceiptView({ data }: { data: Awaited<ReturnType<typeof getReceiptFn>> }) {
  const snap = data.receipt.snapshot;
  const verdict = String(snap.verdict ?? data.guard?.verdict ?? "") as Verdict;
  const copy = verdict ? verdictCopy(verdict) : null;
  const advisory = Boolean(snap.advisory) || data.guard?.authority === "LOCAL";
  const example = Boolean(snap.example) || data.receipt.isExample;

  /**
   * Only a CONTRACT ADDRESS THAT WAS ACTUALLY RECORDED may be shown.
   *
   * resolveGuardDeployment() falls back to the active contract when a Guard has
   * no recorded provenance, which is right for "where would this publish" but
   * wrong here: it stamped an example/local-advisory receipt with the active
   * contract address, i.e. claimed on-chain provenance for a case that never
   * touched a contract. Absent provenance is reported as absent.
   */
  const recordedContract =
    String(
      snap.contractAddress ??
        data.guard?.contractAddress ??
        data.guard?.txCreateContract ??
        "",
    ) || null;
  const provenance = contractProvenanceLabel(recordedContract);
  const finalized = !example && !advisory && data.guard?.status === "RESOLVED" && data.guard?.authority === "GENLAYER";
  const findings = data.guard?.findings ?? null;
  const recordedChainId = snap.chainId ?? data.guard?.chainId ?? null;
  /**
   * N29: the receipt describes the evidence that was actually committed, read
   * from the pinned snapshot — never re-derived from mutable Run rows.
   */
  const committedEvents = parseCommittedEvents(data.guard?.evidenceJson);
  const evidenceLines = committedEvidenceLines(committedEvents);
  /**
   * N31: the Run that produced this evidence. Read from the Guard's pinned
   * evidence snapshot — never "the latest Run" and never the receipt schema, so
   * no historical receipt has to be rewritten to gain a Run reference.
   */
  const runId = runIdOfCommittedSnapshot(data.guard?.evidenceJson);

  return (
    <article>
      {/* 1. Verdict */}
      <header className="border-b border-rule pb-8">
        <div className="flex flex-wrap items-center gap-2">
          {example ? <Badge>Example</Badge> : null}
          {example ? null : advisory ? <Badge tone="warning">Advisory</Badge> : <Badge tone="success">GenLayer</Badge>}
          <ProtocolStatusBadge state={finalized ? "RESOLVED" : "DRAFT"} />
          <VerdictBadge verdict={verdict} size="lg" />
        </div>
        <h1 className="mt-4 font-display text-4xl tracking-tight sm:text-5xl">
          {copy?.title ?? "Motive Receipt"}
        </h1>
        <p className="mt-3 max-w-3xl text-lg leading-relaxed text-graphite">{copy?.lede}</p>
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <MetaItem k="Receipt" v={<IdBadge value={data.receipt.id} kind="fingerprint" label="receipt id" />} />
          <MetaItem k="Case" v={<IdBadge value={String(data.receipt.guardId)} kind="guard" label="local Guard id" />} />
          <MetaItem k="Resolved" v={formatUtc(String(snap.resolvedAt ?? data.guard?.resolvedAt ?? ""))} />
        </dl>
      </header>

      {/* 2. Read the result — the prominent plain-language summary */}
      <section className="mt-10 paper-panel p-6 sm:p-8" aria-labelledby="receipt-reading">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-ochre">Summary</p>
        <h2 id="receipt-reading" className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">
          Read the result
        </h2>
        <ol className="mt-6 space-y-5 text-base">
          <li>
            <strong className="font-display text-xl">1. What was asked for</strong>
            <p className="mt-1 leading-relaxed text-graphite">{String(snap.motive ?? data.guard?.motive ?? "")}</p>
          </li>
          <li>
            <strong className="font-display text-xl">2. What was measured</strong>
            <p className="mt-1 leading-relaxed text-graphite">{String(snap.metric ?? data.guard?.metric ?? "")}</p>
          </li>
          <li>
            <strong className="font-display text-xl">3. Why this verdict</strong>
            {/*
              N32: a long semicolon-joined boolean sentence is unreadable. The
              findings read as rows; the raw booleans stay in Technical findings.
            */}
            {findings ? (
              <>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {humanReadableFindings(findings).map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-3 border-b border-rule py-2 text-sm">
                      <dt className="text-graphite">{row.label}</dt>
                      <dd>
                        <Badge tone={row.signal === "positive" ? "success" : row.signal === "negative" ? "danger" : "neutral"}>
                          {row.value}
                        </Badge>
                      </dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3 border-b border-rule py-2 text-sm">
                    <dt className="text-graphite">Primary pattern</dt>
                    <dd className="font-medium">{primaryPatternCopy(data.guard?.primaryPattern)}</dd>
                  </div>
                </dl>
                <p className="mt-3 leading-relaxed text-graphite">
                  These finalized findings deterministically map to{" "}
                  <strong className="font-mono">{verdict || "the recorded outcome"}</strong>.
                </p>
              </>
            ) : (
              <p className="mt-1 leading-relaxed text-graphite">
                The receipt records {verdict || "an unresolved result"}, but no structured finding flags are
                available.
              </p>
            )}
          </li>
          <li>
            <strong className="font-display text-xl">4. Evidence that mattered</strong>
            {evidenceLines.length ? (
              <>
                <ul className="mt-2 space-y-1">
                  {evidenceLines.map((line, index) => (
                    <li key={`${line.label}-${index}`} className="leading-relaxed text-graphite">
                      {/* The recorded observation often already opens with its own
                          number ("12 calendar-confirmed…"), so the quantity is only
                          shown when the wording does not carry it. */}
                      {line.quantity !== null && !startsWithQuantity(line.label, line.quantity) ? (
                        <span className="font-mono tabular-nums text-carbon">{line.quantity} </span>
                      ) : null}
                      {line.label}
                    </li>
                  ))}
                </ul>
                {/*
                  These populations may overlap — a duplicate booking can also be
                  outside the ICP — so no single "eligible" total is presented.
                */}
                <p className="mt-2 text-sm text-graphite">
                  Recorded exactly as captured. These observations may overlap, so they are not summed or
                  subtracted into a single eligible total.
                </p>
                {data.guard && runId ? (
                  <p className="mt-2 text-sm">
                    <Link
                      className="underline-offset-4 hover:underline"
                      to="/app/runs/$id"
                      params={{ id: runId ?? "" }}
                    >
                      View {evidenceLines.length} committed evidence events →
                    </Link>
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-1 leading-relaxed text-graphite">
                The committed evidence fingerprint is the reference for this result. Its exact value is recorded
                under Verification proof.
              </p>
            )}
          </li>
          <li>
            <strong className="font-display text-xl">5. What this means</strong>
            <p className="mt-1 leading-relaxed text-graphite">
              {example
                ? "Illustrative example. It is not a GenLayer verdict and does not describe a user case."
                : advisory
                  ? "Local advisory evaluation. It is not a GenLayer consensus result."
                  : "The verdict comes from finalized contract state. Findings map to it deterministically; nobody can rewrite this receipt."}
            </p>
          </li>
        </ol>
      </section>

      {/* 3–5. Specification */}
      <section className="mt-12" aria-labelledby="spec-title">
        <h2 id="spec-title" className="font-display text-2xl">
          Specification
        </h2>
        <div className="mt-5 grid gap-8 md:grid-cols-2">
          <div className="border-t-2 border-sage pt-4">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-sage">Motive</p>
            <p className="mt-3 font-display text-2xl leading-tight">{String(snap.motive ?? data.guard?.motive ?? "")}</p>
          </div>
          <div className="border-t-2 border-ochre pt-4">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-ochre">Metric</p>
            <p className="mt-3 font-display text-2xl leading-tight">{String(snap.metric ?? data.guard?.metric ?? "")}</p>
          </div>
        </div>
        <div className="mt-8">
          <h3 className="font-display text-xl">Guardrails</h3>
          {data.guard?.guardrails?.length ? (
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {data.guard.guardrails.map((guardrail) => (
                <li key={`${guardrail.kind}-${guardrail.text}`} className="border-l-2 border-sage bg-card px-4 py-3 text-sm">
                  <Badge tone={guardrail.kind === "MUST" ? "danger" : "success"}>{guardrail.kind}</Badge>
                  <span className="ml-2">{guardrail.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-graphite">No guardrails were recorded for this Guard.</p>
          )}
        </div>
      </section>

      {/* 6–8. Findings */}
      {findings ? (
        <section className="mt-12 border-t border-rule pt-8">
          <FindingsSummary findings={findings} pattern={data.guard?.primaryPattern} heading="Findings" />
        </section>
      ) : null}

      {/* 9–10. Verification proof */}
      <section className="mt-12 border-t border-rule pt-8" aria-labelledby="proof-title">
        <h2 id="proof-title" className="font-display text-2xl">
          Verification proof
        </h2>
        {provenance === "legacy" || provenance === "historical" ? (
          <p className="mt-2 text-sm text-graphite">
            This receipt was recorded against a historical deployment. That provenance is preserved exactly as
            recorded; it is not rewritten to the active contract.
          </p>
        ) : null}
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <Row k="Network" v={String(snap.network ?? (advisory ? "local-advisory" : "unknown"))} />
          <Row
            k="Contract"
            v={recordedContract ?? (example ? "Example illustration" : advisory ? "Local advisory evaluation" : "Unknown historical provenance")}
            id={{ kind: "contract" }}
          />
          <Row k="Deployment" v={provenance === "active" ? "ACTIVE · GenLayer Studio Dev · 61997" : provenance === "historical" ? "HISTORICAL · Studionet · 61999" : provenance === "legacy" ? "LEGACY · Studionet · 61999" : "Unverified provenance"} />
          <Row k="Chain ID" v={recordedChainId === null ? (example || advisory ? "n/a" : "Unknown") : String(recordedChainId)} />
          <Row k="On-chain Guard id" v={String(snap.onchainId ?? data.guard?.onchainId ?? (example || advisory ? "n/a" : ""))} id={{ kind: "guard" }} />
          <Row
            k="Evidence commitment tx"
            v={String(snap.txEvidence ?? data.guard?.txEvidence ?? (advisory || example ? "n/a" : ""))}
            id={{ kind: "tx", explorer: { chainId: recordedChainId, contractAddress: recordedContract } }}
          />
          <Row
            k="Evaluation tx"
            v={String(snap.txEvaluate ?? data.guard?.txEvaluate ?? (advisory || example ? "n/a" : ""))}
            id={{ kind: "tx", explorer: { chainId: recordedChainId, contractAddress: recordedContract } }}
          />
          {runId ? <Row k="Run" v={runId} id={{ kind: "run" }} /> : null}
          <Row k="Evidence fingerprint" v={String(snap.evidenceHash ?? "")} id={{ kind: "fingerprint" }} />
          <Row k="Definition fingerprint" v={String(snap.definitionHash ?? "")} id={{ kind: "fingerprint" }} />
          <Row k="Finalized" v={finalized ? "Yes — finalized contract state" : "No. This is not a GenLayer finalized verdict."} />
        </dl>

        {(snap.txCreate || snap.txArm || snap.txEvidence) ? (
          <TechnicalDetails className="mt-6" title="Transaction history">
            <dl>
              {snap.txCreate ? <div><dt>create_guard</dt><dd><IdBadge value={snap.txCreate} kind="tx" provenance={{ contractAddress: recordedContract, chainId: recordedChainId }} /></dd></div> : null}
              {snap.txArm ? <div><dt>arm_guard</dt><dd><IdBadge value={snap.txArm} kind="tx" provenance={{ contractAddress: recordedContract, chainId: recordedChainId }} /></dd></div> : null}
              {snap.txEvidence ? <div><dt>submit_evidence</dt><dd><IdBadge value={snap.txEvidence} kind="tx" provenance={{ contractAddress: recordedContract, chainId: recordedChainId }} /></dd></div> : null}
            </dl>
          </TechnicalDetails>
        ) : null}
      </section>

      {data.guard ? (
        <p className="mt-10 flex flex-wrap gap-4 text-sm">
          <Link className="underline-offset-4 hover:underline" to="/app/guards/$id" params={{ id: data.guard.id }}>
            {CTA.openCase}
          </Link>
          <Link className="underline-offset-4 hover:underline" to="/contract">
            {CTA.technicalDetails}
          </Link>
        </p>
      ) : null}
    </article>
  );
}

function MetaItem({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-graphite">{k}</dt>
      <dd className="mt-1 break-words">{v}</dd>
    </div>
  );
}

function Row({
  k,
  v,
  id,
}: {
  k: string;
  v: string;
  id?: { kind: "guard" | "tx" | "fingerprint" | "contract" | "run"; explorer?: { chainId: number | null; contractAddress: string | null } };
}) {
  if (!v || v === "n/a") {
    return (
      <div className="border-b border-rule pb-3">
        <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-graphite">{k}</dt>
        <dd className="mt-1 text-graphite">—</dd>
      </div>
    );
  }
  return (
    <div className="min-w-0 border-b border-rule pb-3">
      <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-graphite">{k}</dt>
      <dd className="mt-1 break-words">
        {id ? <IdBadge value={v} kind={id.kind} label={k} provenance={id.explorer} /> : v}
      </dd>
    </div>
  );
}

/** True when a label already opens with its own recorded quantity. */
function startsWithQuantity(label: string, quantity: number): boolean {
  return new RegExp(`^${quantity}(?:\\D|$)`).test(label.trim());
}

/** The Run id recorded in a Guard's pinned evidence snapshot (N31). */
function runIdOfCommittedSnapshot(evidenceJson: string | null | undefined): string | null {
  if (!evidenceJson) return null;
  try {
    const parsed = JSON.parse(evidenceJson) as { runId?: unknown };
    return typeof parsed.runId === "string" && parsed.runId ? parsed.runId : null;
  } catch {
    return null;
  }
}

/**
 * Read the committed evidence events out of the pinned Guard snapshot.
 *
 * Returns [] on anything unexpected: a receipt must never fail to render
 * because an old snapshot has a shape this build did not write.
 */
function parseCommittedEvents(evidenceJson: string | null | undefined): RunEvent[] {
  if (!evidenceJson) return [];
  try {
    const parsed = JSON.parse(evidenceJson) as { events?: unknown };
    if (!Array.isArray(parsed.events)) return [];
    return parsed.events.filter(
      (event): event is RunEvent =>
        Boolean(event) && typeof event === "object" && "data" in (event as object),
    );
  } catch {
    return [];
  }
}
