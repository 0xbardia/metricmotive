import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiteFooter, SiteHeader } from "@/components/chrome";
import { Badge, VerdictStamp } from "@/components/ui/badge";
import { guardDeployment } from "@/lib/contract";
import { GENLAYER, verdictCopy, type Verdict } from "@/lib/domain";
import { getReceiptFn } from "@/lib/server/actions";
import { formatDate, shortHex } from "@/lib/format";

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
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
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
                : "The proof has not been changed. Try again."}
            </p>
            <button type="button" className="mt-4 text-sm underline-offset-4 hover:underline" onClick={() => void q.refetch()}>
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

function ReceiptView({
  data,
}: {
  data: Awaited<ReturnType<typeof getReceiptFn>>;
}) {
  const snap = data.receipt.snapshot;
  const verdict = String(snap.verdict ?? data.guard?.verdict ?? "") as Verdict;
  const copy = verdict ? verdictCopy(verdict) : null;
  const advisory = Boolean(snap.advisory) || data.guard?.authority === "LOCAL";
  const example = Boolean(snap.example) || data.receipt.isExample;
  const contractLine = example
    ? "Example illustration. Not a Studionet verdict."
    : advisory
      ? "Local advisory evaluation. Not a Studionet consensus receipt."
      : String(snap.contractAddress || (data.guard ? guardDeployment(data.guard).contractAddress : "Unknown historical provenance"));
  return (
    <article>
      <div className="flex flex-wrap items-center gap-2">
        {example ? <Badge>Example</Badge> : null}
        {example ? null : advisory ? (
          <Badge tone="ochre">Advisory</Badge>
        ) : (
          <Badge tone="sage">GenLayer</Badge>
        )}
        <VerdictStamp verdict={verdict} />
      </div>
      <h1 className="mt-4 font-display text-4xl tracking-tight">
        {copy?.title ?? "Motive Receipt"}
      </h1>
      <p className="mt-3 text-graphite">{copy?.lede}</p>
      <section className="mt-8 paper-panel p-6" aria-labelledby="receipt-reading">
        <h2 id="receipt-reading" className="font-display text-2xl">Read the result</h2>
        <ol className="mt-4 space-y-4 text-sm">
          <li><strong>1. Asked for.</strong><p className="mt-1 text-graphite">{String(snap.motive ?? data.guard?.motive ?? "")}</p></li>
          <li><strong>2. Recorded outcome.</strong><p className="mt-1 text-graphite">The run was recorded as <span className="font-mono">{String(snap.status ?? data.guard?.status ?? "unknown")}</span> with the verdict above.</p></li>
          <li><strong>3. Why.</strong><p className="mt-1 text-graphite">{findingNarrative(data.guard?.findings, verdict)}</p></li>
          <li><strong>4. Evidence that mattered.</strong><p className="mt-1 text-graphite">The committed evidence fingerprint is the reference for this result; the raw value is available below.</p></li>
          <li><strong>5. What next.</strong><p className="mt-1 text-graphite">{advisory ? "Treat this as local advisory analysis and submit the evidence to GenLayer before calling it final." : "Use the locked evidence and verdict as the baseline for the next Guard version."}</p></li>
        </ol>
      </section>
      <dl className="mt-8 space-y-4">
        <Row k="Motive" v={String(snap.motive ?? data.guard?.motive ?? "")} />
        <Row k="Metric" v={String(snap.metric ?? data.guard?.metric ?? "")} />
        <Row
          k="Guardrails"
          v={
            data.guard?.guardrails?.length
              ? data.guard.guardrails.map((g) => `${g.kind}: ${g.text}`).join(" · ")
              : "None recorded"
          }
        />
        <Row k="Version" v={String(snap.version ?? data.guard?.version ?? 1)} />
        <Row k="Status" v={String(snap.status ?? data.guard?.status ?? "")} />
        <Row
          k="Evidence fingerprint"
          v={shortHex(String(snap.evidenceHash ?? data.guard?.evidenceHash ?? ""), 8)}
          copy={String(snap.evidenceHash ?? data.guard?.evidenceHash ?? "")}
        />
        <Row
          k="Findings"
          v={
            data.guard?.findings
              ? `goal ${data.guard.findings.goal_advanced} · metric ${data.guard.findings.metric_satisfied} · violation ${data.guard.findings.material_violation} · circumvention ${data.guard.findings.circumvention_detected} · evidence ${data.guard.findings.evidence_sufficient}`
              : "None"
          }
        />
        <Row
          k="Pattern"
          v={String(snap.primaryPattern ?? data.guard?.primaryPattern ?? "NONE")}
        />
        <Row
          k="Network"
          v={String(snap.network ?? (advisory ? "local-advisory" : GENLAYER.network))}
        />
        <Row k="Contract" v={contractLine} copy={contractLine.startsWith("0x") ? contractLine : undefined} />
        <Row k="Chain ID" v={example || advisory ? "n/a" : String(snap.chainId ?? data.guard?.chainId ?? "Unknown")} />
        <Row
          k="On-chain id"
          v={String(snap.onchainId ?? data.guard?.onchainId ?? (example || advisory ? "n/a" : ""))}
          copy={String(snap.onchainId ?? data.guard?.onchainId ?? "")}
        />
        <Row
          k="Evaluate tx"
          v={String(snap.txEvaluate ?? data.guard?.txEvaluate ?? (advisory || example ? "n/a" : ""))}
          copy={String(snap.txEvaluate ?? data.guard?.txEvaluate ?? "")}
        />
        <Row
          k="Finalized"
          v={
            example || advisory
              ? "No. This is not a GenLayer finalized verdict."
              : data.guard?.status === "RESOLVED" && data.guard.authority === "GENLAYER"
                ? "Yes"
                : "No"
          }
        />
        <Row
          k="Resolved"
          v={formatDate(String(snap.resolvedAt ?? data.guard?.resolvedAt ?? ""))}
        />
      </dl>
      {data.guard ? (
        <p className="mt-8 text-sm">
          <Link
            className="underline-offset-4 hover:underline"
            to="/app/guards/$id"
            params={{ id: data.guard.id }}
          >
            Open full case
          </Link>
        </p>
      ) : null}
    </article>
  );
}

function Row({ k, v, copy }: { k: string; v: string; copy?: string }) {
  return (
    <div className="border-b border-rule pb-3">
      <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-graphite">
        {k}
      </dt>
      <dd className="mt-1 break-words">{v || "—"}{copy && copy !== "n/a" ? <CopyValue value={copy} /> : null}</dd>
    </div>
  );
}

function CopyValue({ value }: { value: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "unavailable">("idle");
  return (
    <button
      type="button"
      className="ml-2 inline-flex min-h-8 items-center rounded border border-rule px-2 align-middle text-[0.6875rem] font-medium text-graphite hover:text-carbon"
      aria-label={`Copy ${value}`}
      onClick={() => {
        setCopyState("idle");
        if (!navigator.clipboard) {
          setCopyState("unavailable");
          return;
        }
        void navigator.clipboard.writeText(value).then(
          () => {
            setCopyState("copied");
            window.setTimeout(() => setCopyState("idle"), 1200);
          },
          () => {
            setCopyState("unavailable");
            window.setTimeout(() => setCopyState("idle"), 1800);
          },
        );
      }}
    >
      {copyState === "copied" ? "Copied" : copyState === "unavailable" ? "Copy unavailable" : "Copy"}
    </button>
  );
}

function findingNarrative(
  findings: { goal_advanced: boolean; metric_satisfied: boolean; material_violation: boolean; circumvention_detected: boolean; evidence_sufficient: boolean } | null | undefined,
  verdict: string,
): string {
  if (!findings) return `The receipt records ${verdict || "an unresolved result"}, but no structured finding flags are available.`;
  const reasons = [
    findings.metric_satisfied ? "the metric was satisfied" : "the metric was not satisfied",
    findings.goal_advanced ? "the underlying goal advanced" : "the underlying goal did not advance",
    findings.material_violation ? "a material violation was found" : "no material violation was found",
    findings.circumvention_detected ? "circumvention was detected" : "no circumvention was detected",
    findings.evidence_sufficient ? "the evidence was sufficient" : "the evidence was insufficient",
  ];
  return `${reasons.join(", ")}. Those findings map to ${verdict || "the recorded outcome"}.`;
}
