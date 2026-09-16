import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useAccount } from "wagmi";
import { AppShell } from "@/components/app-shell";
import { AdvisoryNote } from "@/components/chrome";
import { SubmitEvidenceChain } from "@/components/chain-actions";
import { FlowRail, TechnicalDetails } from "@/components/product-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import type { DriftReport, JsonBag, RunEvent } from "@/lib/domain";
import { auditUiAction } from "@/lib/action-audit";
import {
  appendEventFn,
  driftFn,
  finishRunFn,
  getRunFn,
} from "@/lib/server/actions";
import { ensureWalletSession } from "@/lib/wallet/auth-client";
import { WalletProviders } from "@/lib/wallet/provider";

export const Route = createFileRoute("/app/runs/$id")({ component: RunPage });

const CATEGORIES = [
  ["observation", "Observation"],
  ["metric", "Metric result"],
  ["quality", "Quality"],
  ["scope", "Scope"],
  ["safety", "Safety"],
  ["cost", "Cost"],
] as const;

const SOURCES = [
  ["manual", "Manual"],
  ["agent", "Agent"],
  ["crm", "CRM"],
  ["simulation", "Simulation"],
  ["sdk", "SDK"],
] as const;

function RunPage() {
  return (
    <WalletProviders>
      <RunPageContent />
    </WalletProviders>
  );
}

function RunPageContent() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { address, connector } = useAccount();
  const q = useQuery({
    queryKey: ["run", id],
    queryFn: () => getRunFn({ data: { id } }),
  });
  const [observation, setObservation] = useState("");
  const [result, setResult] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState("observation");
  const [source, setSource] = useState("manual");
  const [notes, setNotes] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [type, setType] = useState("action");
  const [advancedSource, setAdvancedSource] = useState("agent");
  const [data, setData] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  const appendIntentRef = useRef(false);
  const finishIntentRef = useRef(false);

  const append = useMutation({
    mutationFn: async () => {
      if (!address || !connector) throw new Error("Connect a wallet before recording evidence.");
      await ensureWalletSession(address, connector);
      auditUiAction({ actionName: "evidence_event_recorded", resourceId: id });
      let event: RunEvent;
      if (advanced) {
        let parsed: JsonBag = {};
        try {
          const value: unknown = JSON.parse(data || "{}");
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
          parsed = value as JsonBag;
        } catch {
          throw new Error("Developer event data must be valid JSON.");
        }
        event = { timestamp: new Date().toISOString(), type, source: advancedSource, data: parsed };
      } else {
        const trimmedObservation = observation.trim();
        if (!trimmedObservation) throw new Error("Add an observation before recording evidence.");
        const eventData: JsonBag = { observation: trimmedObservation, category };
        if (result.trim()) eventData.result = result.trim();
        if (quantity.trim()) {
          const number = Number(quantity);
          eventData.quantity = Number.isFinite(number) ? number : quantity.trim();
        }
        if (notes.trim()) eventData.notes = notes.trim();
        event = {
          timestamp: new Date().toISOString(),
          type: category,
          source,
          data: eventData,
        };
      }
      return appendEventFn({ data: { runId: id, event } });
    },
    onSuccess: () => {
      setObservation("");
      setResult("");
      setQuantity("");
      setNotes("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["run", id] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not record evidence."),
  });

  const finish = useMutation({
    mutationFn: async () => {
      if (!address || !connector) throw new Error("Connect a wallet before finishing this Run.");
      await ensureWalletSession(address, connector);
      auditUiAction({ actionName: "run_finished", resourceId: id });
      return finishRunFn({ data: { runId: id, outcome: { recorded: true } } });
    },
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["run", id] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not finish this Run."),
  });

  async function appendEvent() {
    if (appendIntentRef.current || finishIntentRef.current) return;
    appendIntentRef.current = true;
    try {
      await append.mutateAsync();
    } finally {
      appendIntentRef.current = false;
    }
  }

  async function finishEventLog() {
    if (appendIntentRef.current || finishIntentRef.current) return;
    finishIntentRef.current = true;
    try {
      await finish.mutateAsync();
    } finally {
      finishIntentRef.current = false;
    }
  }

  const drift = useMutation({
    mutationFn: async () => {
      if (!address || !connector) throw new Error("Connect a wallet before requesting analysis.");
      await ensureWalletSession(address, connector);
      auditUiAction({ actionName: "motive_drift_requested", resourceId: id });
      return driftFn({ data: { runId: id } });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Advisory analysis is unavailable."),
  });

  if (q.isLoading) {
    return <AppShell wallet={false}><p className="text-sm text-graphite">Loading Run…</p></AppShell>;
  }
  if (q.isError) {
    const message = q.error instanceof Error ? q.error.message : "";
    const unauthorized = /authentication|control|access/i.test(message);
    return (
      <AppShell wallet={false}>
        <div role="alert" className="paper-panel max-w-2xl p-6">
          <p className="font-display text-2xl">{unauthorized ? "You don’t have access to this Run." : "We couldn’t load this Run right now."}</p>
          <p className="mt-2 text-sm text-graphite">{unauthorized ? "Connect the wallet that owns this Run. Evidence is private to its Guard owner." : "Your Run was not deleted. Check the wallet session or try again."}</p>
          <Button className="mt-4" variant="outline" onClick={() => void q.refetch()}>Try again</Button>
        </div>
      </AppShell>
    );
  }
  const run = q.data?.run;
  const guard = q.data?.guard;
  if (!run || !guard) return <AppShell wallet={false}><p>Run not found.</p></AppShell>;

  const automatic = run.agentRef !== "manual";
  const finished = run.status === "FINISHED";
  const canCommit = finished && run.events.length > 0 && guard.status === "ARMED" && Boolean(guard.onchainId);
  const sourceCounts = run.events.reduce<Record<string, number>>((counts, event) => {
    counts[event.source] = (counts[event.source] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <AppShell wallet={false}>
      <div className="max-w-5xl">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-graphite">Run capture</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl tracking-tight">What happened?</h1>
            <p className="mt-2 text-sm text-graphite">
              <Link className="underline-offset-4 hover:underline" to="/app/guards/$id" params={{ id: guard.id }}>Return to Guard</Link>
              <span className="mx-2">·</span><span className="font-mono">{run.id}</span>
            </p>
          </div>
          <Badge tone={finished ? "sage" : "ochre"}>{finished ? "Run finished" : "Run in progress"}</Badge>
        </div>
        <div className="mt-7"><FlowRail steps={["Define", "Lock", "Run", "Review & verify"]} current={finished ? 3 : 2} /></div>
        {error ? <p className="mt-5 rounded-md bg-brick-soft px-3 py-2 text-sm text-carbon" role="alert">{error}</p> : null}

        {!finished ? (
          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <section aria-labelledby="capture-title">
              <div className="mode-note" data-mode={automatic ? "automatic" : "manual"}>
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-graphite">{automatic ? "Automatic capture" : "Manual capture"}</p>
                <p className="mt-1 font-medium">{automatic ? "Your agent is sending evidence as it works." : "Connected agents can record evidence automatically while they work."}</p>
                <Link className="mt-2 inline-block text-sm text-graphite underline-offset-4 hover:text-carbon hover:underline" to="/docs" hash="developers">Connect an agent</Link>
              </div>

              <form className="mt-8 space-y-5" onSubmit={(event) => { event.preventDefault(); void appendEvent(); }}>
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.13em] text-ochre">Manual evidence</p>
                  <h2 id="capture-title" className="mt-2 font-display text-3xl tracking-tight">Record an observation.</h2>
                  <p className="mt-2 text-sm leading-relaxed text-graphite">Use plain language. MetricMotive turns this into a structured event while preserving the source you choose.</p>
                </div>
                <fieldset>
                  <Label htmlFor="observation">Action / observation</Label>
                  <Textarea id="observation" value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="Prospect was outside the declared ICP" />
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-2">
                  <fieldset><Label htmlFor="result">Result <span className="font-normal text-graphite">(optional)</span></Label><Input id="result" value={result} onChange={(event) => setResult(event.target.value)} placeholder="Marked as a meeting" /></fieldset>
                  <fieldset><Label htmlFor="quantity">Count <span className="font-normal text-graphite">(optional)</span></Label><Input id="quantity" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="41" /></fieldset>
                  <fieldset><Label htmlFor="category">Category</Label><Select id="category" value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></fieldset>
                  <fieldset><Label htmlFor="source">Source</Label><Select id="source" value={source} onChange={(event) => setSource(event.target.value)}>{SOURCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></fieldset>
                </div>
                <fieldset><Label htmlFor="notes">Notes <span className="font-normal text-graphite">(optional)</span></Label><Input id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Reference, context, or qualification detail" /></fieldset>
                <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={append.isPending || appendIntentRef.current || !observation.trim()}>{append.isPending ? "Recording…" : "Add evidence"}</Button><span className="text-sm text-graphite">Nothing is committed on-chain until you review the finished Run.</span></div>
              </form>

              <details className="mt-8 technical-details" open={advanced} onToggle={(event) => setAdvanced(event.currentTarget.open)}>
                <summary>Developer mode · raw event capture</summary>
                <div className="technical-details-body space-y-4">
                  <p className="text-sm leading-relaxed">For SDK parity and debugging. This uses the same canonical event endpoint; it does not bypass ownership or evidence validation.</p>
                  <div className="grid gap-4 sm:grid-cols-2"><fieldset><Label htmlFor="advanced-type">Event type</Label><Input id="advanced-type" value={type} onChange={(event) => setType(event.target.value)} /></fieldset><fieldset><Label htmlFor="advanced-source">Source</Label><Input id="advanced-source" value={advancedSource} onChange={(event) => setAdvancedSource(event.target.value)} /></fieldset></div>
                  <fieldset><Label htmlFor="advanced-data">Raw JSON data</Label><Textarea id="advanced-data" value={data} onChange={(event) => setData(event.target.value)} /></fieldset>
                  <p className="text-xs text-graphite">Developer mode replaces the plain-language form for the next event.</p>
                </div>
              </details>
            </section>

            <aside className="lg:sticky lg:top-28 lg:self-start">
              <div className="paper-panel p-5">
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-graphite">Evidence captured</p>
                <p className="mt-2 font-display text-5xl">{run.events.length}</p>
                <p className="text-sm text-graphite">events in this Run</p>
                {run.events.length ? <div className="mt-5 border-t border-rule pt-4"><p className="text-xs text-graphite">Sources</p><ul className="mt-2 space-y-1 text-sm">{Object.entries(sourceCounts).map(([name, count]) => <li key={name} className="flex justify-between"><span className="capitalize">{name}</span><span className="font-mono">{count}</span></li>)}</ul></div> : <p className="mt-5 border-t border-rule pt-4 text-sm text-graphite">Start with one observation. You can add up to 80.</p>}
              </div>
              <div className="mt-5 text-sm text-graphite"><p className="font-medium text-carbon">When you are done</p><p className="mt-1">Finish the Run to review the evidence before anything is committed to GenLayer.</p><Button className="mt-3" type="button" variant="outline" onClick={() => void finishEventLog()} disabled={finish.isPending || append.isPending || appendIntentRef.current || finishIntentRef.current}>{finish.isPending ? "Finishing…" : run.events.length ? "Finish Run" : "Finish Run without evidence"}</Button></div>
            </aside>
          </div>
        ) : (
          <FinishedRunReview run={run} guard={guard} canCommit={canCommit} drift={drift} onUpdated={() => qc.invalidateQueries({ queryKey: ["run", id] })} />
        )}
      </div>
    </AppShell>
  );
}

function FinishedRunReview({
  run,
  guard,
  canCommit,
  drift,
  onUpdated,
}: {
  run: Awaited<ReturnType<typeof getRunFn>>["run"];
  guard: Awaited<ReturnType<typeof getRunFn>>["guard"];
  canCommit: boolean;
  drift: {
    isPending: boolean;
    mutate: () => void;
    data?: { report: DriftReport; model: string };
  };
  onUpdated: () => void;
}) {
  const observations = run.events.map((event) => ({ event, summary: eventSummary(event) }));
  return (
    <div className="mt-8 space-y-8">
      {run.events.length ? (
        <section className="product-status paper-panel p-5" aria-labelledby="evidence-review-title">
          <Badge tone="sage">Evidence ready for review</Badge>
          <h2 id="evidence-review-title" className="mt-3 font-display text-3xl tracking-tight">Review what happened before verification.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">{run.events.length} events were captured for this Run. The summary below is human-readable; the canonical manifest remains available in Technical details.</p>
          <ul className="evidence-summary-list mt-6" aria-label="Run evidence timeline">
            {observations.map(({ event, summary }, index) => <li key={`${event.timestamp}-${index}`}><time dateTime={event.timestamp}>{event.timestamp.slice(11, 16)} UTC</time><p><span className="font-medium">{summary}</span><span className="mt-1 block text-xs text-graphite">Source: {event.source}</span></p></li>)}
          </ul>
          <TechnicalDetails className="mt-5" title="Evidence integrity and raw events">
            <dl><div><dt>Run ID</dt><dd>{run.id}</dd></div><div><dt>Guard ID</dt><dd>{guard.onchainId ?? guard.id}</dd></div><div><dt>Captured events</dt><dd>{run.events.length}</dd></div><div><dt>Manifest status</dt><dd>Generated on confirmation preview</dd></div></dl>
            <ul className="mt-5 space-y-2 border-t border-rule pt-4">{run.events.map((event, index) => <li key={`${event.timestamp}-raw-${index}`}><details><summary className="font-mono text-xs">View raw event {index + 1}</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words bg-cream p-3 font-mono text-xs text-carbon">{JSON.stringify(event, null, 2)}</pre></details></li>)}</ul>
          </TechnicalDetails>
        </section>
      ) : (
        <section className="product-status paper-panel p-5" data-tone="brick" aria-labelledby="empty-evidence-title">
          <Badge tone="brick">No evidence captured</Badge>
          <h2 id="empty-evidence-title" className="mt-3 font-display text-3xl tracking-tight">No evidence has been captured yet.</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-graphite">Add evidence or connect an agent before verification. MetricMotive will block an empty manifest; no wallet transaction can be sent from this Run.</p>
          <Link className="mt-5 inline-block" to="/app/guards/$id" params={{ id: guard.id }}><Button variant="outline">Return to Guard</Button></Link>
        </section>
      )}

      {canCommit ? (
        <section aria-labelledby="verify-title">
          <p className="font-mono text-xs uppercase tracking-[0.13em] text-ochre">Verification</p>
          <h2 id="verify-title" className="mt-2 font-display text-3xl tracking-tight">Commit evidence, then ask GenLayer.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">First the evidence is committed to the locked Guard. Then GenLayer validators evaluate whether the metric was achieved faithfully.</p>
          <div className="mt-5"><SubmitEvidenceChain guardId={guard.id} runId={run.id} onchainId={guard.onchainId} txEvidence={guard.txEvidence} onUpdated={onUpdated} /></div>
        </section>
      ) : null}

      {guard.status === "EVIDENCE_SUBMITTED" || guard.status === "RESOLVED" ? <div className="border-t border-rule pt-5 text-sm text-graphite">{guard.status === "RESOLVED" ? "Evidence and the final result are confirmed by GenLayer." : "Evidence is committed. Continue to verification from the Guard page."} <Link className="ml-1 underline-offset-4 hover:underline" to="/app/guards/$id" params={{ id: guard.id }}>Open Guard</Link></div> : null}
      <section className="border-t border-rule pt-5"><AdvisoryNote>Motive drift is an optional analytical aid. It is not a GenLayer finding or verdict.</AdvisoryNote><Button className="mt-3" variant="ghost" onClick={() => drift.mutate()} disabled={drift.isPending}>{drift.isPending ? "Reviewing drift…" : "Optional: review motive drift"}</Button>{drift.data ? <p className="mt-3 max-w-2xl text-sm">{drift.data.report.notes}</p> : null}</section>
    </div>
  );
}

function eventSummary(event: RunEvent): string {
  const observation = event.data.observation ?? event.data.summary ?? event.data.action;
  if (typeof observation === "string" && observation.trim()) return observation;
  const result = event.data.result;
  if (typeof result === "string" && result.trim()) return result;
  return event.type.replaceAll("_", " ");
}
