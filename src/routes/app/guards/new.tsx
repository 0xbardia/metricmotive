import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { useRef, useState } from "react";
import { useAccount } from "wagmi";
import { AppShell } from "@/components/app-shell";
import { CreateAndLock } from "@/components/chain-actions";
import { FlowRail, TechnicalDetails } from "@/components/product-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/field";
import {
  type Guardrail,
  type GuardrailKind,
  LIMITS,
  parseGuardrails,
} from "@/lib/domain";
import { auditUiAction } from "@/lib/action-audit";
import {
  addGuardrailFn,
  blueprintFn,
  createGuardFn,
  getGuardFn,
  loopholeFn,
  preflightFn,
  updateDraftFn,
} from "@/lib/server/actions";
import { ensureWalletSession } from "@/lib/wallet/auth-client";
import { WalletProviders } from "@/lib/wallet/provider";

export const Route = createFileRoute("/app/guards/new")({ component: NewGuard });

const STEPS = ["Define", "Protect", "Review", "Publish & lock"] as const;

const SUGGESTED_GUARDRAILS: Array<{
  label: string;
  kind: GuardrailKind;
  text: string;
}> = [
  { label: "Quality", kind: "QUALITY", text: "Preserve the quality of the intended outcome." },
  { label: "Scope", kind: "MUST", text: "Stay within the declared audience, scope, or eligibility rules." },
  { label: "Cost", kind: "MUST", text: "Do not exceed the approved cost or resource limit." },
  { label: "Safety", kind: "MUST", text: "Do not create avoidable safety or compliance risk." },
  { label: "Compliance", kind: "MUST", text: "Follow the applicable policy and approval requirements." },
  { label: "No metric inflation", kind: "MUST", text: "Do not inflate the metric with duplicates or low-quality activity." },
];

function NewGuard() {
  return (
    <WalletProviders>
      <NewGuardContent />
    </WalletProviders>
  );
}

function NewGuardContent() {
  const navigate = useNavigate();
  const { address, connector } = useAccount();
  const [step, setStep] = useState(0);
  const [id, setId] = useState<string | null>(null);
  const [motive, setMotive] = useState("");
  const [metric, setMetric] = useState("");
  const [kind, setKind] = useState<GuardrailKind>("MUST");
  const [railText, setRailText] = useState("");
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<Awaited<ReturnType<typeof preflightFn>> | null>(null);
  const [loopholes, setLoopholes] = useState<Awaited<ReturnType<typeof loopholeFn>> | null>(null);
  const [blueprint, setBlueprint] = useState<Awaited<ReturnType<typeof blueprintFn>> | null>(null);
  const persistIntentRef = useRef(false);

  const persist = useMutation({
    mutationFn: async () => {
      if (!address || !connector) throw new Error("Connect a wallet to save this Guard.");
      await ensureWalletSession(address, connector);
      auditUiAction({ actionName: id ? "guard_definition_updated" : "guard_builder_saved", resourceId: id });
      const payload = { motive, metric, guardrails };
      if (!id) {
        const res = await createGuardFn({ data: payload });
        setId(res.guard.id);
        return res.guard.id;
      }
      await updateDraftFn({ data: { id, ...payload } });
      return id;
    },
  });

  async function goNext() {
    if (persistIntentRef.current) return;
    setError(null);
    persistIntentRef.current = true;
    try {
      if (step === 0) {
        if (motive.trim().length < 8) {
          setError("Describe the real outcome in a full sentence.");
          return;
        }
        if (metric.trim().length < 4) {
          setError("Name a measurable target.");
          return;
        }
        await persist.mutateAsync();
        setStep(1);
        return;
      }

      const guardId = await persist.mutateAsync();
      if (step === 1) {
        const [p, l, b] = await Promise.all([
          preflightFn({ data: { id: guardId } }),
          loopholeFn({ data: { id: guardId } }),
          blueprintFn({ data: { id: guardId } }),
        ]);
        setPreflight(p);
        setLoopholes(l);
        setBlueprint(b);
      }
      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this Guard.");
    } finally {
      persistIntentRef.current = false;
    }
  }

  function addRail() {
    try {
      const next = parseGuardrails([...guardrails, { kind, text: railText }]);
      setGuardrails(next);
      setRailText("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add a guardrail before continuing.");
    }
  }

  function selectSuggestion(suggestion: (typeof SUGGESTED_GUARDRAILS)[number]) {
    setKind(suggestion.kind);
    setRailText(suggestion.text);
    window.requestAnimationFrame(() => document.getElementById("rail-text")?.focus());
  }

  const guardQ = useQuery({
    queryKey: ["guard", id],
    queryFn: () => getGuardFn({ data: { id: id! } }),
    enabled: Boolean(id) && step === 3,
  });

  return (
    <AppShell wallet={false}>
      <div className="max-w-4xl">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-graphite">
          Guard builder
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl tracking-tight">Define what success means.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">
              A Guard records the outcome you want, the number you will measure, and what the
              agent must not sacrifice to reach it.
            </p>
          </div>
          <span className="font-mono text-xs text-graphite">{String(step + 1).padStart(2, "0")} / 04</span>
        </div>
        <div className="mt-7">
          <FlowRail steps={STEPS} current={step} />
        </div>

        <div className="mt-8 max-w-3xl stagger-in" key={step}>
          {step === 0 ? (
            <section aria-labelledby="define-title">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-ochre">Start with intent</p>
              <h2 id="define-title" className="mt-2 font-display text-3xl tracking-tight">What should the agent actually achieve?</h2>
              <div className="mt-7 grid gap-6 md:grid-cols-2">
                <fieldset>
                  <Label htmlFor="motive">Motive</Label>
                  <p className="mb-2 text-sm text-graphite">
                    Describe the real-world result—not the number the agent should maximize.
                  </p>
                  <Textarea
                    id="motive"
                    value={motive}
                    maxLength={LIMITS.motive}
                    onChange={(event) => setMotive(event.target.value)}
                    placeholder="Generate genuine qualified sales opportunities from the declared ICP."
                  />
                  <p className="mt-1 text-xs text-graphite tabular-nums">{LIMITS.motive - motive.length} characters left</p>
                </fieldset>
                <fieldset>
                  <Label htmlFor="metric">Metric</Label>
                  <p className="mb-2 text-sm text-graphite">
                    Define the measurable target the agent will optimize.
                  </p>
                  <Textarea
                    id="metric"
                    value={metric}
                    maxLength={LIMITS.metric}
                    onChange={(event) => setMetric(event.target.value)}
                    placeholder="Book 80 meetings this week."
                  />
                  <p className="mt-1 text-xs text-graphite">A metric is useful. It is not the whole motive.</p>
                </fieldset>
              </div>
              <div className="mt-7 border-l-2 border-ochre pl-4 text-sm text-graphite">
                The useful tension is intentional: the metric is what gets counted; the motive is what still matters when the count goes up.
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section aria-labelledby="protect-title">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-ochre">Protect the outcome</p>
              <h2 id="protect-title" className="mt-2 font-display text-3xl tracking-tight">What must not be sacrificed?</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">
                Add quality, scope, cost, safety, or compliance constraints. Suggestions only fill the editor; nothing changes until you add it.
              </p>

              <div className="mt-7">
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-graphite">Suggested guardrails</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTED_GUARDRAILS.map((suggestion) => (
                    <button
                      key={suggestion.label}
                      type="button"
                      className="min-h-11 rounded-sm border border-rule bg-card px-3 text-sm text-carbon transition-colors hover:border-ochre hover:bg-ochre-soft"
                      onClick={() => selectSuggestion(suggestion)}
                    >
                      + {suggestion.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-7 border-t border-rule pt-5">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Guardrail category">
                  {(["MUST", "QUALITY"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setKind(value)}
                      aria-pressed={kind === value}
                      className="min-h-11"
                    >
                      <Badge tone={kind === value ? "ink" : "graphite"}>
                        {value === "MUST" ? "Must not happen" : "Quality to preserve"}
                      </Badge>
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="rail-text">Guardrail</Label>
                    <Input
                      id="rail-text"
                      value={railText}
                      onChange={(event) => setRailText(event.target.value)}
                      placeholder={kind === "MUST" ? "Stay within the declared audience." : "Preserve accurate, useful outcomes."}
                      maxLength={LIMITS.guardrailText}
                    />
                  </div>
                  <Button variant="outline" className="sm:self-end" onClick={addRail} disabled={!railText.trim()}>
                    Add guardrail
                  </Button>
                </div>
              </div>

              <ul className="mt-5 space-y-2" aria-label="Added guardrails">
                {guardrails.map((guardrail, index) => (
                  <li key={`${guardrail.kind}-${index}`} className="flex items-start justify-between gap-3 border-b border-rule py-3">
                    <span className="min-w-0 text-sm">
                      <Badge tone={guardrail.kind === "MUST" ? "brick" : "sage"}>{guardrail.kind}</Badge>
                      <span className="ml-2">{guardrail.text}</span>
                    </span>
                    <button
                      type="button"
                      className="min-h-11 shrink-0 text-sm text-graphite underline-offset-4 hover:text-carbon hover:underline"
                      onClick={() => setGuardrails(guardrails.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              {!guardrails.length ? <p className="mt-5 text-sm text-graphite">No guardrails added yet. You can continue, but an explicit constraint makes the result easier to verify.</p> : null}
            </section>
          ) : null}

          {step === 2 ? (
            <section aria-labelledby="review-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.14em] text-ochre">Review before publishing</p>
                  <h2 id="review-title" className="mt-2 font-display text-3xl tracking-tight">Does the definition say what you mean?</h2>
                </div>
                <Badge tone="ochre">Advisory checks</Badge>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">
                These checks help you strengthen the draft. They are editor guidance, not a GenLayer verdict.
              </p>

              <div className="mt-7 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-6">
                  <div className="border-t border-rule pt-4">
                    <p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-sage">Motive</p>
                    <p className="mt-2 font-display text-2xl leading-tight">{motive}</p>
                  </div>
                  <div className="border-t border-rule pt-4">
                    <p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-ochre">Metric</p>
                    <p className="mt-2 font-display text-2xl leading-tight">{metric}</p>
                  </div>
                  <div className="border-t border-rule pt-4">
                    <p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-graphite">Guardrails</p>
                    {guardrails.length ? (
                      <ul className="mt-2 space-y-2 text-sm">
                        {guardrails.map((guardrail) => <li key={`${guardrail.kind}-${guardrail.text}`}><Badge tone={guardrail.kind === "MUST" ? "brick" : "sage"}>{guardrail.kind}</Badge><span className="ml-2">{guardrail.text}</span></li>)}
                      </ul>
                    ) : <p className="mt-2 text-sm text-graphite">No guardrails recorded.</p>}
                  </div>
                </div>
                <div className="space-y-4">
                  {preflight ? (
                    <div className="paper-panel p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-mono text-xs uppercase tracking-[0.12em] text-graphite">Motive preflight</p>
                        <Badge tone={preflight.report.state === "GAMEABLE" ? "brick" : preflight.report.state === "READY" ? "sage" : "ochre"}>{preflight.report.state}</Badge>
                      </div>
                      <ul className="mt-3 space-y-3 text-sm">
                        {preflight.report.issues.length ? preflight.report.issues.map((issue) => <li key={issue.title}><strong>{issue.title}.</strong> {issue.detail}</li>) : <li>No advisory issues found.</li>}
                      </ul>
                      {preflight.report.recommendedGuardrails.length ? <div className="mt-4 border-t border-rule pt-3"><p className="text-xs text-graphite">Possible additions</p><div className="mt-2 flex flex-wrap gap-2">{preflight.report.recommendedGuardrails.map((guardrail) => <Button key={guardrail.text} size="sm" variant="outline" onClick={async () => { if (!id || !address || !connector) return; await ensureWalletSession(address, connector); auditUiAction({ actionName: "guardrail_added", resourceId: id }); const result = await addGuardrailFn({ data: { id, guardrail } }); setGuardrails(result.guard.guardrails); }}>{guardrail.text.slice(0, 42)}</Button>)}</div></div> : null}
                    </div>
                  ) : <p className="text-sm text-graphite">Running advisory checks…</p>}
                  {loopholes ? <div className="border-t border-rule pt-4"><p className="font-mono text-xs uppercase tracking-[0.12em] text-graphite">Loophole scan</p><ul className="mt-3 space-y-3 text-sm">{loopholes.report.loopholes.slice(0, 3).map((loophole) => <li key={loophole.title}><strong>{loophole.title}.</strong> {loophole.description}</li>)}{!loopholes.report.loopholes.length ? <li>No obvious loophole surfaced.</li> : null}</ul></div> : null}
                </div>
              </div>
              {blueprint ? <TechnicalDetails className="mt-8" title="Evidence blueprint (advisory)"><div className="space-y-3 text-sm"><div><p className="font-medium">Required evidence</p><ul className="mt-1 list-disc space-y-1 pl-5 text-graphite">{blueprint.report.required.map((item) => <li key={item}>{item}</li>)}</ul></div><div><p className="font-medium">Recommended evidence</p><ul className="mt-1 list-disc space-y-1 pl-5 text-graphite">{blueprint.report.recommended.map((item) => <li key={item}>{item}</li>)}</ul></div></div></TechnicalDetails> : null}
            </section>
          ) : null}

          {step === 3 ? (
            <section aria-labelledby="publish-title">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-ochre">Make the objective durable</p>
              <h2 id="publish-title" className="mt-2 font-display text-3xl tracking-tight">Publish &amp; lock your motive</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">
                Publishing creates the Guard on GenLayer. Locking freezes this version so the objective cannot be rewritten after seeing the result. The two wallet approvals stay visible and explicit.
              </p>
              <div className="mt-7">
                {id && guardQ.isLoading ? <p className="text-sm text-graphite">Loading the saved definition…</p> : null}
                {id && !guardQ.isLoading ? <CreateAndLock guardId={id} motive={motive} metric={metric} guardrails={guardrails} onchainId={guardQ.data?.guard.onchainId ?? null} txCreate={guardQ.data?.guard.txCreate ?? null} txArm={guardQ.data?.guard.txArm ?? null} onUpdated={() => void guardQ.refetch()} /> : null}
                {!id ? <p className="text-sm text-graphite">Save the definition before publishing.</p> : null}
              </div>
              <TechnicalDetails className="mt-8" title="What gets written on-chain">
                <p className="text-sm leading-relaxed">The certified Intelligent Contract stores the Guard definition on Studionet. The wallet signs each transaction; MetricMotive never stores a private key.</p>
              </TechnicalDetails>
            </section>
          ) : null}

          <FieldError>{error}</FieldError>
          <div className="mt-9 flex flex-wrap gap-3">
            {step > 0 ? <Button variant="ghost" onClick={() => setStep((current) => current - 1)}>Back</Button> : <Link to="/app"><Button variant="ghost">Cancel</Button></Link>}
            {step < 3 ? <Button onClick={() => void goNext()} disabled={persist.isPending || persistIntentRef.current}>{persist.isPending || persistIntentRef.current ? "Saving…" : step === 0 ? "Save definition" : step === 1 ? "Review guard" : "Continue to publish"}<ArrowRight className="size-4" /></Button> : null}
          </div>
          {step === 3 && id && guardQ.data?.guard.status === "ARMED" ? <div className="mt-5 flex items-center gap-2 text-sm text-sage"><Check className="size-4" /> Motive locked on Studionet.<Button size="sm" variant="ghost" onClick={() => void navigate({ to: "/app/guards/$id", params: { id } })}>Open Guard</Button></div> : null}
        </div>
      </div>
    </AppShell>
  );
}
