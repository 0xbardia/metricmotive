import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Play } from "lucide-react";
import { useRef, useState } from "react";
import { useAccount } from "wagmi";
import { AppShell } from "@/components/app-shell";
import { AdvisoryNote } from "@/components/chrome";
import { CreateAndLock, SubmitEvidenceChain, VerifyWithGenLayer } from "@/components/chain-actions";
import { TechnicalDetails } from "@/components/product-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FindingsSummary } from "@/components/ui/findings-summary";
import { IdBadge } from "@/components/ui/id-badge";
import { MetricEligibilityExplanation } from "@/components/ui/metric-eligibility-explanation";
import { NextActionCard } from "@/components/ui/next-action-card";
import { Stepper } from "@/components/ui/stepper";
import { VerdictBadge, ProtocolStatusBadge } from "@/components/ui/verdict-badge";
import { guardDeployment } from "@/lib/contract";
import { auditUiAction } from "@/lib/action-audit";
import { verdictCopy, type Guard } from "@/lib/domain";
import { formatUtc } from "@/lib/format";
import { getGuardLifecyclePresentation } from "@/lib/lifecycle";
import {
  eligibilityObservationsFromEvents,
  explainMetric,
  rawMetricObservationFromEvents,
} from "@/lib/metric-explanation";
import { CTA } from "@/lib/terminology";
import { createV2Fn, getGuardFn, remediateFn, startRunFn } from "@/lib/server/actions";
import { ensureWalletSession } from "@/lib/wallet/auth-client";
import { WalletProviders } from "@/lib/wallet/provider";

export const Route = createFileRoute("/app/guards/$id")({ component: GuardPage });

function GuardPage() {
  return (
    <WalletProviders>
      <GuardPageContent />
    </WalletProviders>
  );
}

function GuardPageContent() {
  const { id } = Route.useParams();
  const { address, connector } = useAccount();
  const [actionError, setActionError] = useState<string | null>(null);
  const v2IntentRef = useRef(false);
  const q = useQuery({ queryKey: ["guard", id], queryFn: () => getGuardFn({ data: { id } }) });

  const start = useMutation({
    mutationFn: async () => {
      if (!address || !connector) throw new Error("Connect a wallet before starting a Run.");
      await ensureWalletSession(address, connector);
      auditUiAction({ actionName: "run_started", resourceId: id });
      return startRunFn({ data: { guardId: id, agentRef: "manual" } });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Could not start the Run."),
    onSuccess: () => setActionError(null),
  });
  const remediate = useMutation({
    mutationFn: async () => {
      if (!address || !connector) throw new Error("Connect a wallet before requesting a review.");
      await ensureWalletSession(address, connector);
      auditUiAction({ actionName: "remediation_requested", resourceId: id });
      return remediateFn({ data: { id } });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Could not prepare the review."),
    onSuccess: () => setActionError(null),
  });
  const v2 = useMutation({
    mutationFn: async () => {
      const guard = q.data?.guard;
      if (!guard) throw new Error("Guard is not loaded.");
      if (!address || !connector) throw new Error("Connect a wallet before creating a new version.");
      await ensureWalletSession(address, connector);
      auditUiAction({ actionName: "create_v2_draft", resourceId: guard.id });
      const plan = remediate.data?.plan;
      return createV2Fn({
        data: {
          parentId: guard.id,
          motive: guard.motive,
          metric: plan?.improvedMetric || guard.metric,
          guardrails: plan?.improvedGuardrails || guard.guardrails,
        },
      });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Could not create the new draft."),
    onSuccess: () => setActionError(null),
  });

  function createV2Once() {
    if (v2IntentRef.current || v2.isPending) return;
    v2IntentRef.current = true;
    v2.mutate(undefined, { onSettled: () => { v2IntentRef.current = false; } });
  }

  if (q.isLoading) return <AppShell wallet={false}><p className="text-sm text-graphite">Loading Guard…</p></AppShell>;
  if (q.isError) {
    const message = q.error instanceof Error ? q.error.message : "";
    const unauthorized = /authentication|control|access/i.test(message);
    const notFound = /not found/i.test(message);
    return (
      <AppShell wallet={false}>
        <div role="alert" className="paper-panel max-w-2xl p-6">
          <p className="font-display text-2xl">{notFound ? "Guard not found." : unauthorized ? "You don’t have access to this Guard." : "We couldn’t load this Guard right now."}</p>
          <p className="mt-2 text-sm text-graphite">{notFound ? "That Guard URL does not identify a published case." : unauthorized ? "Connect the wallet that owns this case. Private Guards are not exposed to other wallets." : "Your case was not deleted. Check the wallet session or try again."}</p>
          <Button className="mt-4" variant="outline" onClick={() => void q.refetch()}>Try again</Button>
        </div>
      </AppShell>
    );
  }
  const data = q.data;
  if (!data) return <AppShell wallet={false}><p>Guard not found.</p></AppShell>;
  const guard = data.guard;
  const copy = guard.verdict ? verdictCopy(guard.verdict) : null;

  const latestRun = data.runs[0];
  const finishedRunWithEvidence = Boolean(latestRun?.status === "FINISHED" && latestRun.events.length > 0);
  const lifecycle = getGuardLifecyclePresentation({
    guardStatus: guard.status,
    authority: guard.authority,
    verdict: guard.verdict,
    published: Boolean(guard.onchainId),
    // The lock is authoritative only once its transaction was recorded (N10).
    lockRecorded: Boolean(guard.txArm),
    // A submitted evidence hash is already a durable intent, even while the
    // local projection is catching up. Keep the Guard page in the same
    // reconciliation/verification state instead of offering a duplicate Run.
    evidenceCommitted: Boolean(guard.evidenceHash || guard.txEvidence),
    hasFinishedRunWithEvidence: finishedRunWithEvidence,
    hasReceipt: Boolean(data.receiptId),
    // N25: evaluation in flight means "Verification in progress".
    verificationRequested: Boolean(guard.txEvaluate) && guard.status !== "RESOLVED",
  });

  const metricExplanation =
    guard.findings && guard.status === "RESOLVED"
      ? explainMetric({
          findings: guard.findings,
          guardrails: guard.guardrails,
          rawObserved: latestRun ? rawMetricObservationFromEvents(latestRun.events) : null,
          target: null,
          observations: latestRun ? eligibilityObservationsFromEvents(latestRun.events) : [],
          // Exact mode stays disabled unless disjoint, event-referenced
          // exclusions can actually be proven from canonical evidence.
          exact: null,
        })
      : null;

  return (
    <AppShell wallet={false}>
      <div className="max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-graphite">
            Case · Guard {guard.onchainId ?? guard.id} · v{guard.version}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {/*
              N1: the lock state is stated explicitly and only claims a lock the
              contract can back. A published-but-unlocked Guard reads
              "PUBLISHED · NOT LOCKED" rather than implying it is already frozen.
            */}
            {guard.status === "RESOLVED" ? null : (
              <Badge tone={lifecycle.lockState === "LOCKED" ? "graphite" : "warning"}>
                {lifecycle.lockLabel}
              </Badge>
            )}
            {guard.status === "RESOLVED" ? <ProtocolStatusBadge state="RESOLVED" /> : null}
            <VerdictBadge verdict={guard.verdict} />
            {guard.authority === "LOCAL" && guard.status === "RESOLVED" ? <Badge tone="warning">Advisory only</Badge> : null}
            {guard.isExample ? <Badge>Example</Badge> : null}
            {guard.recordClass === "DUPLICATE" ? <Badge tone="graphite">Duplicate · superseded</Badge> : null}
          </div>
        </div>
        <h1 className="mt-3 max-w-4xl font-display text-4xl tracking-tight">{guard.motive}</h1>
        {guard.recordClass === "DUPLICATE" && guard.supersededBy ? <p className="mt-4 rounded-md bg-rule px-3 py-2 text-sm text-graphite">This local submission is retained for audit history and superseded by <Link className="font-mono underline-offset-4 hover:underline" to="/app/guards/$id" params={{ id: guard.supersededBy }}>{guard.supersededBy}</Link>. Its on-chain transaction remains unchanged.</p> : null}
        {actionError ? <p className="mt-4 rounded-md bg-brick-soft px-3 py-2 text-sm text-carbon" role="alert">{actionError}</p> : null}

        <Stepper kind="lifecycle" current={lifecycle.step} states={lifecycle.stepStates} className="mt-7" />

        <div className="mt-8">
          <NextActionCard lifecycle={lifecycle}>
            {nextAction({ guard, data, start, lifecycleKind: lifecycle.nextAction.kind, onUpdated: async () => { await q.refetch(); } })}
          </NextActionCard>
        </div>

        <section className="mt-10" aria-labelledby="definition-title">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-graphite">The specification</p>
          <h2 id="definition-title" className="mt-2 font-display text-3xl tracking-tight">What the agent was meant to do.</h2>
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            <div className="border-t-2 border-sage pt-4"><p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-sage">Motive · intended outcome</p><p className="mt-3 font-display text-2xl leading-tight">{guard.motive}</p></div>
            <div className="border-t-2 border-ochre pt-4"><p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-ochre">Metric · measurable proxy</p><p className="mt-3 font-display text-2xl leading-tight">{guard.metric}</p></div>
          </div>
          <div className="mt-8 border-t border-rule pt-5"><div className="flex flex-wrap items-baseline justify-between gap-3"><h3 className="font-display text-2xl">Guardrails</h3><span className="text-sm text-graphite">What must not be sacrificed</span></div><ul className="mt-4 grid gap-2 md:grid-cols-2">{guard.guardrails.length ? guard.guardrails.map((guardrail) => <li key={`${guardrail.kind}-${guardrail.text}`} className="border-l-2 border-sage bg-card px-4 py-3 text-sm"><Badge tone={guardrail.kind === "MUST" ? "danger" : "success"}>{guardrail.kind}</Badge><span className="ml-2">{guardrail.text}</span></li>) : <li className="text-sm text-graphite">No guardrails recorded.</li>}</ul></div>
        </section>

        {copy ? (
          <section className="mt-12 border-t border-rule pt-8" aria-labelledby="verdict-title">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-graphite">
                  {guard.authority === "GENLAYER" ? `Final result · finalized on ${guardDeployment(guard).network}` : "Advisory result"}
                </p>
                <h2 id="verdict-title" className="mt-2 font-display text-4xl tracking-tight">{copy.title}</h2>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-graphite">{copy.lede}</p>
              </div>
              <VerdictBadge verdict={guard.verdict} size="lg" />
            </div>
            {guard.findings ? <FindingsSummary findings={guard.findings} pattern={guard.primaryPattern} className="mt-8" /> : null}
            {metricExplanation ? <MetricEligibilityExplanation explanation={metricExplanation} className="mt-8 border-t border-rule pt-6" /> : null}
            <div className="mt-6 flex flex-wrap gap-3">
              {data.receiptId ? <Link to="/verify/$receiptId" params={{ receiptId: data.receiptId }}><Button>{CTA.viewReceipt}<ArrowRight className="size-4" /></Button></Link> : null}
              <Badge tone="success">Authoritative contract result</Badge>
            </div>
          </section>
        ) : null}

        <section className="mt-12" aria-labelledby="runs-title"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-xs uppercase tracking-[0.14em] text-graphite">Capture history</p><h2 id="runs-title" className="mt-2 font-display text-3xl tracking-tight">Runs</h2></div><span className="font-mono text-xs text-graphite">{data.runs.length} run{data.runs.length === 1 ? "" : "s"}</span></div>{data.runs.length ? <ul className="mt-4 divide-y divide-rule border-y border-rule">{data.runs.map((run) => <li key={run.id}><Link to="/app/runs/$id" params={{ id: run.id }} className="group flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={run.status === "FINISHED" ? "success" : "warning"}>{run.status === "FINISHED" ? "Finished" : "In progress"}</Badge><span className="font-mono text-xs text-graphite">{run.events.length} event{run.events.length === 1 ? "" : "s"}</span></div><p className="mt-1 truncate font-mono text-sm">{run.id}</p></div><span className="flex items-center gap-2 text-sm text-graphite">{formatUtc(run.startedAt)}<ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span></Link></li>)}</ul> : <p className="mt-4 border-y border-rule py-5 text-sm text-graphite">No Runs yet. Once the motive is locked, start a Run to capture what the agent does.</p>}</section>

        <TechnicalDetails className="mt-12" title="Technical details · contract proof">
          <dl>
            <div><dt>Network</dt><dd>{guardDeployment(guard).network} · chain {guardDeployment(guard).chainId}</dd></div>
            <div><dt>Contract</dt><dd><IdBadge value={guardDeployment(guard).contractAddress} kind="contract" /></dd></div>
            <div><dt>Guard ID</dt><dd>{guard.onchainId ? <IdBadge value={guard.onchainId} kind="guard" /> : "Not published"}</dd></div>
            <div><dt>Local resource</dt><dd><IdBadge value={guard.id} kind="guard" label="local Guard id" /></dd></div>
            <div><dt>Definition fingerprint</dt><dd><IdBadge value={guard.definitionHash} kind="fingerprint" /></dd></div>
            <div><dt>Evidence fingerprint</dt><dd>{guard.evidenceHash ? <IdBadge value={guard.evidenceHash} kind="fingerprint" label="evidence fingerprint" /> : "Not committed"}</dd></div>
            <div><dt>Authority</dt><dd>{guard.authority === "GENLAYER" ? "Finalized contract state" : "Local advisory state"}</dd></div>
            <div><dt>Lifecycle status</dt><dd>{guard.status}</dd></div>
            <div><dt>Transaction history</dt><dd className="space-y-1">
              {guard.txCreate ? <span className="flex items-center gap-2">create_guard <IdBadge value={guard.txCreate} kind="tx" provenance={guard} inline /></span> : null}
              {guard.txArm ? <span className="flex items-center gap-2">arm_guard <IdBadge value={guard.txArm} kind="tx" provenance={guard} inline /></span> : null}
              {guard.txEvidence ? <span className="flex items-center gap-2">submit_evidence <IdBadge value={guard.txEvidence} kind="tx" provenance={guard} inline /></span> : null}
              {guard.txEvaluate ? <span className="flex items-center gap-2">evaluate_guard <IdBadge value={guard.txEvaluate} kind="tx" provenance={guard} inline /></span> : null}
              {!guard.txCreate && !guard.txArm && !guard.txEvidence && !guard.txEvaluate ? "No chain transactions yet" : null}
            </dd></div>
          </dl>
        </TechnicalDetails>

        {guard.status === "RESOLVED" ? <TechnicalDetails className="mt-6" title="Advanced · counterfactual review"><AdvisoryNote>Counterfactual review proposes a stronger specification as a NEW draft. It never modifies this locked Guard and is not a GenLayer finding.</AdvisoryNote><Button className="mt-4" variant="outline" loading={remediate.isPending} loadingLabel="Reviewing…" disabled={remediate.isPending} onClick={() => remediate.mutate()}>Review a stronger specification</Button>{remediate.data ? <div className="mt-4 border-t border-rule pt-4 text-sm"><p>{remediate.data.plan.improvedMetric}</p><Button className="mt-4" loading={v2.isPending} loadingLabel="Creating draft…" disabled={v2.isPending} onClick={createV2Once}>Create V2 draft</Button>{v2.data ? <Link className="ml-3 underline" to="/app/guards/$id" params={{ id: v2.data.guard.id }}>{CTA.openCase}</Link> : null}</div> : null}</TechnicalDetails> : null}
      </div>
    </AppShell>
  );
}

function nextAction({
  guard,
  data,
  start,
  lifecycleKind,
  onUpdated,
}: {
  guard: Guard;
  data: Awaited<ReturnType<typeof getGuardFn>>;
  start: {
    isPending: boolean;
    mutateAsync: () => Promise<{ run: { id: string } }>;
  };
  lifecycleKind: string;
  onUpdated: () => void | Promise<void>;
}) {
  if (lifecycleKind === "publish-and-lock") return <CreateAndLock guardId={guard.id} motive={guard.motive} metric={guard.metric} guardrails={guard.guardrails} onchainId={guard.onchainId} txCreate={guard.txCreate} txArm={guard.txArm} onUpdated={onUpdated} />;
  if (lifecycleKind === "start-run") return <div className="flex flex-wrap items-center gap-3"><Button loading={start.isPending} loadingLabel="Starting Run…" disabled={start.isPending} onClick={async () => { const result = await start.mutateAsync(); window.location.href = `/app/runs/${result.run.id}`; }}><Play className="size-4" />{CTA.startRun}</Button></div>;
  if (guard.txEvidence && !guard.evidenceHash && data.runs[0]) {
    return <SubmitEvidenceChain guardId={guard.id} runId={data.runs[0].id} onchainId={guard.onchainId} txEvidence={guard.txEvidence} onUpdated={onUpdated} />;
  }
  if (lifecycleKind === "commit-evidence" && data.runs[0]) {
    return (
      <Link to="/app/runs/$id" params={{ id: data.runs[0].id }}>
        <Button>Commit evidence from this Run<ArrowRight className="size-4" /></Button>
      </Link>
    );
  }
  if (lifecycleKind === "continue-to-verification") return <VerifyWithGenLayer guardId={guard.id} onchainId={guard.onchainId} txEvaluate={guard.txEvaluate} onUpdated={onUpdated} />;
  if (data.receiptId) return <Link to="/verify/$receiptId" params={{ receiptId: data.receiptId }}><Button>{CTA.viewReceipt}<ArrowRight className="size-4" /></Button></Link>;
  return <span className="text-sm text-graphite">This result is recorded. A public receipt is not available for this case.</span>;
}
