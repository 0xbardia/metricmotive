import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Check, LockKeyhole, Play, Search, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { useAccount } from "wagmi";
import { AppShell } from "@/components/app-shell";
import { AdvisoryNote } from "@/components/chrome";
import { CopyValue } from "@/components/landing/copy-value";
import { CreateAndLock, VerifyWithGenLayer } from "@/components/chain-actions";
import { FlowRail, TechnicalDetails } from "@/components/product-ui";
import { Badge, VerdictStamp } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { guardDeployment } from "@/lib/contract";
import { auditUiAction } from "@/lib/action-audit";
import { GENLAYER, patternLabel, verdictCopy, type Findings, type Guard, type GuardStatus } from "@/lib/domain";
import { formatDate, shortHex } from "@/lib/format";
import { createV2Fn, getGuardFn, remediateFn, startRunFn } from "@/lib/server/actions";
import { ensureWalletSession } from "@/lib/wallet/auth-client";
import { WalletProviders } from "@/lib/wallet/provider";

export const Route = createFileRoute("/app/guards/$id")({ component: GuardPage });

function GuardPage() {
  return <WalletProviders><GuardPageContent /></WalletProviders>;
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
  const currentStage = stageForStatus(guard.status);

  return (
    <AppShell wallet={false}>
      <div className="max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-graphite">Case file · Guard {shortHex(guard.id, 6)} · v{guard.version}</p>
          <div className="flex flex-wrap gap-2"><VerdictStamp verdict={guard.verdict ?? guard.status} />{guard.authority === "GENLAYER" && guard.status === "RESOLVED" ? <Badge tone="sage">GenLayer finalized</Badge> : null}{guard.authority === "LOCAL" && guard.status === "RESOLVED" ? <Badge tone="ochre">Advisory only</Badge> : null}{guard.isExample ? <Badge>Example</Badge> : null}{guard.recordClass === "DUPLICATE" ? <Badge tone="graphite">Duplicate · superseded</Badge> : null}</div>
        </div>
        <h1 className="mt-3 max-w-4xl font-display text-4xl tracking-tight">{guard.motive}</h1>
        {guard.recordClass === "DUPLICATE" && guard.supersededBy ? <p className="mt-4 rounded-md bg-rule px-3 py-2 text-sm text-graphite">This local submission is retained for audit history and superseded by <Link className="font-mono underline-offset-4 hover:underline" to="/app/guards/$id" params={{ id: guard.supersededBy }}>{guard.supersededBy}</Link>. Its on-chain transaction remains unchanged.</p> : null}
        {actionError ? <p className="mt-4 rounded-md bg-brick-soft px-3 py-2 text-sm text-carbon" role="alert">{actionError}</p> : null}

        <div className="mt-7"><FlowRail steps={["Define", "Lock", "Run", "Review & verify"]} current={currentStage} /></div>

        <section className="product-status paper-panel mt-8 p-6" data-tone={guard.status === "RESOLVED" ? "sage" : guard.status === "EVIDENCE_SUBMITTED" ? "ochre" : undefined} aria-labelledby="current-state-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0"><p className="font-mono text-[0.6875rem] uppercase tracking-[0.15em] text-graphite">Current state</p><h2 id="current-state-title" className="mt-2 font-display text-3xl tracking-tight">{stateTitle(guard.status, guard.authority)}</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">{stateDescription(guard.status, guard.authority)}</p></div>
            <StatusIcon status={guard.status} />
          </div>
          <div className="mt-6 border-t border-rule pt-5"><p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-graphite">Next action</p><div className="mt-3">{nextAction({ guard, data, start, onUpdated: () => void q.refetch() })}</div></div>
        </section>

        <section className="mt-10" aria-labelledby="definition-title">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-graphite">The specification</p>
          <h2 id="definition-title" className="mt-2 font-display text-3xl tracking-tight">What the agent was meant to do.</h2>
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            <div className="border-t-2 border-sage pt-4"><p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-sage">Motive · intended outcome</p><p className="mt-3 font-display text-2xl leading-tight">{guard.motive}</p></div>
            <div className="border-t-2 border-ochre pt-4"><p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-ochre">Metric · measurable proxy</p><p className="mt-3 font-display text-2xl leading-tight">{guard.metric}</p></div>
          </div>
          <div className="mt-8 border-t border-rule pt-5"><div className="flex flex-wrap items-baseline justify-between gap-3"><h3 className="font-display text-2xl">Guardrails</h3><span className="text-sm text-graphite">What must not be sacrificed</span></div><ul className="mt-4 grid gap-2 md:grid-cols-2">{guard.guardrails.length ? guard.guardrails.map((guardrail) => <li key={`${guardrail.kind}-${guardrail.text}`} className="border-l-2 border-sage bg-card px-4 py-3 text-sm"><Badge tone={guardrail.kind === "MUST" ? "brick" : "sage"}>{guardrail.kind}</Badge><span className="ml-2">{guardrail.text}</span></li>) : <li className="text-sm text-graphite">No guardrails recorded.</li>}</ul></div>
        </section>

        {copy ? <section className="mt-12 border-t border-rule pt-8" aria-labelledby="verdict-title"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-xs uppercase tracking-[0.14em] text-graphite">Final result</p><h2 id="verdict-title" className="mt-2 font-display text-4xl tracking-tight">{copy.title}</h2><p className="mt-3 max-w-2xl text-base leading-relaxed text-graphite">{copy.lede}</p></div><VerdictStamp verdict={guard.verdict} /></div>{guard.findings ? <FindingsView findings={guard.findings} pattern={guard.primaryPattern} /> : null}<div className="mt-6 flex flex-wrap gap-3">{data.receiptId ? <Link to="/verify/$receiptId" params={{ receiptId: data.receiptId }}><Button>View verification receipt<ArrowRight className="size-4" /></Button></Link> : null}<Badge tone="sage">Authoritative contract result</Badge></div></section> : null}

        <section className="mt-12" aria-labelledby="runs-title"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-xs uppercase tracking-[0.14em] text-graphite">Capture history</p><h2 id="runs-title" className="mt-2 font-display text-3xl tracking-tight">Runs</h2></div><span className="font-mono text-xs text-graphite">{data.runs.length} run{data.runs.length === 1 ? "" : "s"}</span></div>{data.runs.length ? <ul className="mt-4 divide-y divide-rule border-y border-rule">{data.runs.map((run) => <li key={run.id}><Link to="/app/runs/$id" params={{ id: run.id }} className="group flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={run.status === "FINISHED" ? "sage" : "ochre"}>{run.status === "FINISHED" ? "Finished" : "In progress"}</Badge><span className="font-mono text-xs text-graphite">{run.events.length} event{run.events.length === 1 ? "" : "s"}</span></div><p className="mt-1 truncate font-mono text-sm">{run.id}</p></div><span className="flex items-center gap-2 text-sm text-graphite">{formatDate(run.startedAt)}<ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span></Link></li>)}</ul> : <p className="mt-4 border-y border-rule py-5 text-sm text-graphite">No Runs yet. Once the motive is locked, start a Run to capture what the agent does.</p>}</section>

        <TechnicalDetails className="mt-12" title="Technical details · contract proof"><dl><div><dt>Network</dt><dd>{GENLAYER.network} · chain {GENLAYER.chainId}</dd></div><div><dt>Contract</dt><dd><CopyValue value={guardDeployment(guard).contractAddress} label="contract address" /></dd></div><div><dt>Guard ID</dt><dd>{guard.onchainId ?? "Not published"}</dd></div><div><dt>Definition fingerprint</dt><dd><CopyValue value={guard.definitionHash} label="definition fingerprint" /></dd></div><div><dt>Authority</dt><dd>{guard.authority === "GENLAYER" ? "Finalized contract state" : "Local advisory state"}</dd></div><div><dt>Lifecycle status</dt><dd>{guard.status}</dd></div><div><dt>Transaction history</dt><dd className="space-y-1">{guard.txCreate ? <span className="block">create_guard · {shortHex(guard.txCreate, 8)}</span> : null}{guard.txArm ? <span className="block">arm_guard · {shortHex(guard.txArm, 8)}</span> : null}{guard.txEvidence ? <span className="block">submit_evidence · {shortHex(guard.txEvidence, 8)}</span> : null}{guard.txEvaluate ? <span className="block">evaluate_guard · {shortHex(guard.txEvaluate, 8)}</span> : null}{!guard.txCreate && !guard.txArm && !guard.txEvidence && !guard.txEvaluate ? "No chain transactions yet" : null}</dd></div></dl></TechnicalDetails>

        {guard.status === "RESOLVED" ? <TechnicalDetails className="mt-6" title="Advanced · counterfactual review"><AdvisoryNote>Remediation creates a new draft. It never modifies this locked Guard.</AdvisoryNote><Button className="mt-4" variant="outline" onClick={() => remediate.mutate()} disabled={remediate.isPending}>{remediate.isPending ? "Reviewing…" : "Review a stronger specification"}</Button>{remediate.data ? <div className="mt-4 border-t border-rule pt-4 text-sm"><p>{remediate.data.plan.improvedMetric}</p><Button className="mt-4" onClick={createV2Once} disabled={v2.isPending || v2IntentRef.current}>{v2.isPending ? "Creating draft…" : "Create V2 draft"}</Button>{v2.data ? <Link className="ml-3 underline" to="/app/guards/$id" params={{ id: v2.data.guard.id }}>Open new draft</Link> : null}</div> : null}</TechnicalDetails> : null}
      </div>
    </AppShell>
  );
}

function nextAction({
  guard,
  data,
  start,
  onUpdated,
}: {
  guard: Guard;
  data: Awaited<ReturnType<typeof getGuardFn>>;
  start: {
    isPending: boolean;
    mutateAsync: () => Promise<{ run: { id: string } }>;
  };
  onUpdated: () => void;
}) {
  if (guard.status === "DRAFT") return <CreateAndLock guardId={guard.id} motive={guard.motive} metric={guard.metric} guardrails={guard.guardrails} onchainId={guard.onchainId} txCreate={guard.txCreate} txArm={guard.txArm} onUpdated={onUpdated} />;
  if (guard.status === "ARMED") return <div className="flex flex-wrap items-center gap-3"><Button onClick={async () => { const result = await start.mutateAsync(); window.location.href = `/app/runs/${result.run.id}`; }} disabled={start.isPending}><Play className="size-4" />{start.isPending ? "Starting Run…" : "Start a Run"}</Button><span className="text-sm text-graphite">The motive is locked. Capture what the agent does.</span></div>;
  if (guard.status === "EVIDENCE_SUBMITTED") return <VerifyWithGenLayer guardId={guard.id} onchainId={guard.onchainId} txEvaluate={guard.txEvaluate} onUpdated={onUpdated} />;
  if (data.receiptId) return <Link to="/verify/$receiptId" params={{ receiptId: data.receiptId }}><Button>View verification receipt<ArrowRight className="size-4" /></Button></Link>;
  return <span className="text-sm text-graphite">This result is recorded. A public receipt is not available for this case.</span>;
}

function FindingsView({ findings, pattern }: { findings: Findings; pattern: Guard["primaryPattern"] }) {
  const rows = [
    ["Metric target reached", findings.metric_satisfied ? "Yes" : "No", findings.metric_satisfied ? "sage" : "graphite"],
    ["Motive advanced", findings.goal_advanced ? "Yes" : "No", findings.goal_advanced ? "sage" : "brick"],
    ["Material guardrail violation", findings.material_violation ? "Detected" : "Not detected", findings.material_violation ? "brick" : "sage"],
    ["Circumvention", findings.circumvention_detected ? "Detected" : "Not detected", findings.circumvention_detected ? "brick" : "sage"],
    ["Evidence sufficient", findings.evidence_sufficient ? "Yes" : "No", findings.evidence_sufficient ? "sage" : "graphite"],
  ] as const;
  return <div className="mt-8"><h3 className="font-display text-2xl">Why GenLayer reached this result</h3><div className="mt-4 grid gap-2 sm:grid-cols-2">{rows.map(([label, value, tone]) => <div key={label} className="flex items-center justify-between gap-3 border-b border-rule py-3 text-sm"><span>{label}</span><span className={`font-mono ${tone === "brick" ? "text-brick" : tone === "sage" ? "text-sage" : "text-graphite"}`}>{value}</span></div>)}</div><p className="mt-5 text-sm">Primary pattern: <strong>{pattern && pattern !== "NONE" ? patternLabel(pattern) : "None"}</strong>{pattern && pattern !== "NONE" ? <span className="ml-2 text-graphite">The evidence identifies a meaningful divergence from the intended outcome.</span> : null}</p><TechnicalDetails className="mt-5" title="Technical findings"><pre className="overflow-x-auto whitespace-pre-wrap break-words bg-cream p-3 font-mono text-xs text-carbon">{JSON.stringify(findings, null, 2)}</pre></TechnicalDetails></div>;
}

function stageForStatus(status: GuardStatus): number {
  return { DRAFT: 0, ARMED: 1, EVIDENCE_SUBMITTED: 3, RESOLVED: 3 }[status];
}

function stateTitle(status: GuardStatus, authority: Guard["authority"]): string {
  if (status === "DRAFT") return "Ready to publish the definition.";
  if (status === "ARMED") return "Motive locked. Start capturing evidence.";
  if (status === "EVIDENCE_SUBMITTED") return "Evidence committed. Ask GenLayer to verify it.";
  return authority === "GENLAYER" ? "Verified by GenLayer." : "A local advisory result is ready.";
}

function stateDescription(status: GuardStatus, authority: Guard["authority"]): string {
  if (status === "DRAFT") return "The definition is still editable. Publish it, then approve the separate lock transaction in your wallet.";
  if (status === "ARMED") return "This version is immutable on Studionet. The next step is to record what the agent actually did.";
  if (status === "EVIDENCE_SUBMITTED") return "The evidence fingerprint is committed. GenLayer evaluates the semantic question against the locked motive, metric, and guardrails.";
  return authority === "GENLAYER" ? "The contract holds the finalized findings and deterministic verdict. Review the evidence that mattered below." : "This analysis is advisory. It is not a GenLayer consensus result.";
}

function StatusIcon({ status }: { status: GuardStatus }) {
  const Icon = status === "DRAFT" ? Search : status === "ARMED" ? LockKeyhole : status === "EVIDENCE_SUBMITTED" ? ShieldCheck : Check;
  return <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-current text-ochre"><Icon className="size-5" aria-hidden="true" /></div>;
}
