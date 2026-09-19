import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useAccount } from "wagmi";
import { AppShell } from "@/components/app-shell";
import { AdvisoryNote } from "@/components/chrome";
import { SubmitEvidenceChain } from "@/components/chain-actions";
import { TechnicalDetails } from "@/components/product-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EvidenceList, EvidenceSummary } from "@/components/ui/evidence-list";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { BackButton } from "@/components/ui/back-button";
import { IdBadge } from "@/components/ui/id-badge";
import { StatusBanner } from "@/components/ui/status-banner";
import { EvidenceCommittedCard } from "@/components/ui/evidence-committed-card";
import { Stepper } from "@/components/ui/stepper";
import type { DriftReport, JsonBag, RunEvent } from "@/lib/domain";
import { auditUiAction } from "@/lib/action-audit";
import { getGuardLifecyclePresentation } from "@/lib/lifecycle";
import { CTA } from "@/lib/terminology";
import { appendEventFn, driftFn, finishRunFn, getRunFn } from "@/lib/server/actions";
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

/** A fresh Manual evidence form holds no real values: examples are placeholders. */
const EMPTY_EVENT_FORM: { observation: string; result: string; quantity: string; notes: string } = {
  observation: "",
  result: "",
  quantity: "",
  notes: "",
};

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
  const [observation, setObservation] = useState(EMPTY_EVENT_FORM.observation);
  const [result, setResult] = useState(EMPTY_EVENT_FORM.result);
  const [quantity, setQuantity] = useState(EMPTY_EVENT_FORM.quantity);
  const [category, setCategory] = useState("observation");
  const [source, setSource] = useState("manual");
  const [notes, setNotes] = useState(EMPTY_EVENT_FORM.notes);
  const [advanced, setAdvanced] = useState(false);
  const [type, setType] = useState("action");
  const [advancedSource, setAdvancedSource] = useState("agent");
  const [data, setData] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  const [confirmFinishEmpty, setConfirmFinishEmpty] = useState(false);
  const appendIntentRef = useRef(false);
  const finishIntentRef = useRef(false);

  function resetEventForm() {
    setObservation(EMPTY_EVENT_FORM.observation);
    setResult(EMPTY_EVENT_FORM.result);
    setQuantity(EMPTY_EVENT_FORM.quantity);
    setNotes(EMPTY_EVENT_FORM.notes);
    setCategory("observation");
    setSource("manual");
  }

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
        event = { timestamp: new Date().toISOString(), type: category, source, data: eventData };
      }
      return appendEventFn({ data: { runId: id, event } });
    },
    onSuccess: async () => {
      resetEventForm();
      setError(null);
      await qc.invalidateQueries({ queryKey: ["run", id] });
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
      setConfirmFinishEmpty(false);
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

  function requestFinish(eventCount: number) {
    // An empty Run needs explicit confirmation. The server still enforces the
    // empty-evidence rules, so this is never a bypass (C2).
    if (eventCount === 0) {
      setConfirmFinishEmpty(true);
      return;
    }
    void finishEventLog();
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
    /*
     * Three distinct outcomes, three distinct messages. A Run that never
     * existed is NOT a transient failure: "Try again" cannot conjure it, and
     * telling someone their Run "was not deleted" when they mistyped an id
     * invents an event. This mirrors the receipt route.
     */
    const message = q.error instanceof Error ? q.error.message : "";
    const missing = /not found/i.test(message);
    const unauthorized = /authentication|control|access/i.test(message);
    const headline = missing
      ? "This Run does not exist."
      : unauthorized
        ? "You don’t have access to this Run."
        : "We couldn’t load this Run right now.";
    const detail = missing
      ? "No Run has this identifier. Check the link or return to the Guard."
      : unauthorized
        ? "Connect the wallet that owns this Run. Evidence is private to its Guard owner."
        : "Your Run was not deleted. Check the wallet session or try again.";
    return (
      <AppShell wallet={false}>
        <div role="alert" className="paper-panel max-w-2xl p-6">
          <p className="font-display text-2xl">{headline}</p>
          <p className="mt-2 text-sm text-graphite">{detail}</p>
          {missing ? (
            <Link to="/app" className="mt-4 inline-block">
              <Button variant="outline">Back to Cases</Button>
            </Link>
          ) : (
            <Button className="mt-4" variant="outline" onClick={() => void q.refetch()}>
              Try again
            </Button>
          )}
        </div>
      </AppShell>
    );
  }
  const run = q.data?.run;
  const guard = q.data?.guard;
  if (!run || !guard) return <AppShell wallet={false}><p>Run not found.</p></AppShell>;

  const automatic = run.agentRef !== "manual";
  const finished = run.status === "FINISHED";
  const canCommit = finished && run.events.length > 0 && guard.status === "ARMED" && Boolean(guard.onchainId) && !guard.evidenceHash;
  const lifecycle = getGuardLifecyclePresentation({
    guardStatus: guard.status,
    authority: guard.authority,
    // The Guard behind this Run was locked by this transaction (N1 / N10).
    lockRecorded: Boolean(guard.txArm),
    evidenceCommitted: Boolean(guard.evidenceHash),
    hasFinishedRunWithEvidence: finished && run.events.length > 0,
    // N25: evaluation in flight means "Verification in progress", never a stale
    // "Continue to verification" instruction.
    verificationRequested: Boolean(guard.txEvaluate) && guard.status !== "RESOLVED",
  });

  return (
    <AppShell wallet={false}>
      <div className="max-w-5xl">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-graphite">Run capture</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl tracking-tight">What happened?</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-graphite">
              <BackButton to="/app/guards/$id" params={{ id: guard.id }} label="Back to Guard" />
              <span aria-hidden="true">·</span>
              <IdBadge value={run.id} kind="run" inline />
            </div>
          </div>
          <Badge tone={finished ? "success" : "warning"}>{finished ? "Run finished" : "Run in progress"}</Badge>
        </div>

        <Stepper
          kind="lifecycle"
          current={finished ? lifecycle.step : 2}
          states={finished ? lifecycle.stepStates : undefined}
          className="mt-7"
        />

        {error ? (
          <StatusBanner
            className="mt-6"
            status="Run action"
            severity="danger"
            title="That action did not complete"
            message={error}
          />
        ) : null}

        {!finished ? (
          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <section aria-labelledby="capture-title">
              <div className="mode-note" data-mode={automatic ? "automatic" : "manual"}>
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-graphite">{automatic ? "Automatic capture" : "Manual capture"}</p>
                <p className="mt-1 font-medium">{automatic ? "Your agent is sending evidence as it works." : "Connected agents can record evidence automatically while they work."}</p>
                <Link className="mt-2 inline-block text-sm text-graphite underline-offset-4 hover:text-carbon hover:underline" to="/docs" hash="sdk">Connect an agent</Link>
              </div>

              <form
                className="mt-8 space-y-5"
                onSubmit={(event) => { event.preventDefault(); void appendEvent(); }}
                onReset={resetEventForm}
              >
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.13em] text-ochre">Manual evidence</p>
                  <h2 id="capture-title" className="mt-2 font-display text-3xl tracking-tight">Record an observation.</h2>
                  <p className="mt-2 text-sm leading-relaxed text-graphite">Use plain language. MetricMotive turns this into a structured event while preserving the source you choose.</p>
                </div>
                <fieldset>
                  <Label htmlFor="observation">Action / observation</Label>
                  <Textarea id="observation" value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="e.g. Prospect was outside the declared audience" />
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-2">
                  <fieldset><Label htmlFor="result">Result <span className="font-normal text-graphite">(optional)</span></Label><Input id="result" value={result} onChange={(event) => setResult(event.target.value)} placeholder="e.g. Meeting counted toward the metric" /></fieldset>
                  <fieldset><Label htmlFor="quantity">Count <span className="font-normal text-graphite">(optional)</span></Label><Input id="quantity" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="e.g. 12" /></fieldset>
                  <fieldset><Label htmlFor="category">Category</Label><Select id="category" value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></fieldset>
                  <fieldset><Label htmlFor="source">Source</Label><Select id="source" value={source} onChange={(event) => setSource(event.target.value)}>{SOURCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></fieldset>
                </div>
                <fieldset><Label htmlFor="notes">Notes <span className="font-normal text-graphite">(optional)</span></Label><Input id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Reference, context, or qualification detail" /></fieldset>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="submit"
                    loading={append.isPending || appendIntentRef.current}
                    loadingLabel="Recording…"
                    disabled={append.isPending || appendIntentRef.current || !observation.trim()}
                  >
                    Add evidence
                  </Button>
                  <span className="text-sm text-graphite">Nothing is committed on-chain until you review the finished Run.</span>
                </div>
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
                {run.events.length ? <EvidenceSummary events={run.events} className="mt-5 border-t border-rule pt-4" /> : <p className="mt-5 border-t border-rule pt-4 text-sm text-graphite">Start with one observation. You can add up to 80.</p>}
              </div>
              {/* N17: once evidence exists, the next action is explicit. An event
                  in a Run is a fact worth confirming back to the user — with the
                  two real choices, not just a vague "Finish Run". */}
              {run.events.length ? (
                <div className="mt-5 border-t border-rule pt-4 text-sm">
                  <p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-graphite">
                    Next action
                  </p>
                  <p className="mt-2 font-medium text-carbon">
                    {run.events.length} {run.events.length === 1 ? "evidence event" : "evidence events"} captured.
                  </p>
                  <p className="mt-1 text-graphite">
                    Keep capturing, or finish the Run to review everything before anything is committed to
                    GenLayer.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const field = document.getElementById("observation");
                        field?.focus();
                      }}
                    >
                      Add more evidence
                    </Button>
                    <Button
                      loading={finish.isPending || finishIntentRef.current}
                      loadingLabel="Finishing…"
                      disabled={finish.isPending || append.isPending || appendIntentRef.current || finishIntentRef.current}
                      data-action="finish-run"
                      onClick={() => requestFinish(run.events.length)}
                    >
                      {CTA.continueToCommitment}
                    </Button>
                  </div>
                </div>
              ) : null}
              {/* ONE finish action (C1). With evidence captured the card above
                  already offers "Add more evidence" plus the primary commit
                  step; this block used to repeat the same finish action a
                  second time. It is kept only for an empty Run, where there is
                  no next-action card and finishing needs the guard rail. */}
              {!run.events.length ? (
                <div className="mt-5 text-sm text-graphite">
                  <p className="font-medium text-carbon">When you are done</p>
                  <p className="mt-1">Finish the Run to review the evidence before anything is committed to GenLayer.</p>
                  <Button
                    className="mt-3"
                    variant="outline"
                    loading={finish.isPending || finishIntentRef.current}
                    loadingLabel="Finishing…"
                    disabled={finish.isPending || append.isPending || appendIntentRef.current || finishIntentRef.current}
                    data-action="finish-run"
                    onClick={() => requestFinish(run.events.length)}
                  >
                    {CTA.finishWithoutEvidence}
                  </Button>
                </div>
              ) : null}
            </aside>
          </div>
        ) : (
          <FinishedRunReview run={run} guard={guard} canCommit={canCommit} drift={drift} onUpdated={() => qc.invalidateQueries({ queryKey: ["run", id] })} />
        )}

        {confirmFinishEmpty ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/40 p-4">
            <div role="alertdialog" aria-modal="true" aria-labelledby="finish-empty-title" aria-describedby="finish-empty-body" className="paper-panel w-full max-w-lg p-6">
              <h2 id="finish-empty-title" className="font-display text-2xl tracking-tight">Finish without evidence?</h2>
              <p id="finish-empty-body" className="mt-3 text-sm leading-relaxed text-graphite">
                This Run contains no evidence. GenLayer may be unable to determine whether the Guard was satisfied.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => setConfirmFinishEmpty(false)}>{CTA.addEvidence}</Button>
                <Button
                  loading={finish.isPending || finishIntentRef.current}
                  loadingLabel="Finishing…"
                  onClick={() => void finishEventLog()}
                >
                  {CTA.finishWithoutEvidence}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
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
  const guardIdLabel = guard.onchainId ?? guard.id;

  if (!run.events.length) {
    return (
      <div className="mt-8 space-y-8">
        <StatusBanner
          status="Run finished"
          severity="danger"
          title="NO EVIDENCE CAPTURED"
          message="This Run was finished without any recorded events. MetricMotive will not build or commit an empty evidence bundle, so GenLayer cannot evaluate this Run."
        />
        <div>
          <Link to="/app/guards/$id" params={{ id: guard.id }}><Button variant="outline">Return to Guard</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-8">
      <section className="product-status paper-panel p-5" aria-labelledby="evidence-review-title">
        <Badge tone="success">Evidence ready for review</Badge>
        <h2 id="evidence-review-title" className="mt-3 font-display text-3xl tracking-tight">Evidence captured in this Run.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">{run.events.length} events were captured for this Run. This is the canonical list; the raw manifest stays in Technical details.</p>
        <EvidenceList events={run.events} className="mt-6" />
        <TechnicalDetails className="mt-5" title="Evidence integrity and raw events">
          <dl>
            <div><dt>Run ID</dt><dd><IdBadge value={run.id} kind="run" /></dd></div>
            <div><dt>Guard ID</dt><dd><IdBadge value={guardIdLabel} kind="guard" /></dd></div>
            <div><dt>Captured events</dt><dd>{run.events.length}</dd></div>
            <div><dt>Manifest status</dt><dd>Generated on confirmation preview</dd></div>
          </dl>
          <ul className="mt-5 space-y-2 border-t border-rule pt-4">{run.events.map((event, index) => <li key={`${event.timestamp}-raw-${index}`}><details><summary className="font-mono text-xs">View raw event {index + 1}</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words bg-cream p-3 font-mono text-xs text-carbon">{JSON.stringify(event, null, 2)}</pre></details></li>)}</ul>
        </TechnicalDetails>
      </section>

      {canCommit ? (
        <section aria-labelledby="verify-title">
          <p className="font-mono text-xs uppercase tracking-[0.13em] text-ochre">Verification</p>
          <h2 id="verify-title" className="mt-2 font-display text-3xl tracking-tight">Commit evidence, then ask GenLayer.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">First the evidence is committed to the locked Guard. Then GenLayer validators evaluate whether the metric was achieved faithfully.</p>
          <div className="mt-5"><SubmitEvidenceChain guardId={guard.id} runId={run.id} onchainId={guard.onchainId} txEvidence={guard.txEvidence} onUpdated={onUpdated} /></div>
        </section>
      ) : null}

      {guard.evidenceHash && guard.status !== "RESOLVED" ? (
        /* One canonical finalized card. Retry / "needs attention" / "commit
           evidence" controls are gone for a committed Run (Phase 12). */
        <EvidenceCommittedCard
          guardId={guard.id}
          eventCount={run.events.length}
          txEvidence={guard.txEvidence}
          manifestHash={guard.evidenceHash}
          provenance={guard}
        />
      ) : null}

      {guard.status === "RESOLVED" ? (
        <StatusBanner
          status="Finalized on-chain"
          severity="success"
          title="Evidence and the final result are confirmed by GenLayer."
          message="Nothing further is required for this Run."
          action={<Link to="/app/guards/$id" params={{ id: guard.id }}><Button variant="outline">{CTA.openCase}</Button></Link>}
        />
      ) : null}

      <section className="border-t border-rule pt-5">
        <AdvisoryNote>Motive drift is an optional analytical aid. It is not a GenLayer finding or verdict.</AdvisoryNote>
        <Button className="mt-3" variant="ghost" loading={drift.isPending} loadingLabel="Reviewing drift…" disabled={drift.isPending} onClick={() => drift.mutate()}>Optional: review motive drift</Button>
        {drift.data ? <p className="mt-3 max-w-2xl text-sm">{drift.data.report.notes}</p> : null}
      </section>
    </div>
  );
}
