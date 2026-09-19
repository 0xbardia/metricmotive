import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Pencil } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { AppShell } from "@/components/app-shell";
import { CreateAndLock } from "@/components/chain-actions";
import { TechnicalDetails } from "@/components/product-ui";
import { Stepper } from "@/components/ui/stepper";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/field";
import {
  type Guardrail,
  type GuardrailKind,
  LIMITS,
  parseGuardrails,
} from "@/lib/domain";
import { auditUiAction } from "@/lib/action-audit";
import { BUILDER_FLOW } from "@/lib/lifecycle";
import { CTA } from "@/lib/terminology";
import {
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

type NewGuardSearch = { guardId?: string };

const PERSISTED_GUARD_HINT_KEY = "metricmotive.guard-draft";

const STEPS = BUILDER_FLOW.steps;

const SUGGESTED_GUARDRAILS: Array<{
  label: string;
  kind: GuardrailKind;
  text: string;
}> = [
  {
    label: "Count only eligible records",
    kind: "MUST",
    text: "Do not count a record toward the metric unless it matches the declared audience and eligibility rules.",
  },
  {
    label: "No duplicate records",
    kind: "MUST",
    text: "Do not count the same person, company, or record twice under a new name or date.",
  },
  {
    label: "No misleading outreach",
    kind: "MUST",
    text: "Do not reach the metric through outreach that misstates the purpose, price, or commitment.",
  },
  {
    label: "Stay inside the cost limit",
    kind: "MUST",
    text: "Do not exceed the approved budget or resource limit to reach the metric.",
  },
  {
    label: "Preserve quality of the outcome",
    kind: "QUALITY",
    text: "Preserve the usefulness and accuracy of the outcome, not only its volume.",
  },
  {
    label: "Preserve downstream trust",
    kind: "QUALITY",
    text: "Preserve the trust of the people affected after the metric is reported.",
  },
];

/** Advisory severity for preflight output: INFO / CAUTION / RISK (H6). */
function advisoryLabel(state: string): string {
  if (state === "GAMEABLE") return "Risk";
  if (state === "AMBIGUOUS" || state === "INCOMPLETE") return "Caution";
  return "Info";
}

function advisoryTone(state: string): "danger" | "warning" | "success" {
  if (state === "GAMEABLE") return "danger";
  if (state === "AMBIGUOUS" || state === "INCOMPLETE") return "warning";
  return "success";
}

/** Inline validation for the builder's two text fields (M3). */
function motiveMetricErrors(motive: string, metric: string) {
  return {
    motive: !motive.trim()
      ? "Describe the outcome the agent should achieve."
      : motive.trim().length < 8
        ? "Use a full sentence: at least 8 characters."
        : motive.length > LIMITS.motive
          ? `Keep the motive under ${LIMITS.motive} characters.`
          : null,
    metric: !metric.trim()
      ? "Name a measurable target."
      : metric.trim().length < 4
        ? "Name a measurable target: at least 4 characters."
        : metric.length > LIMITS.metric
          ? `Keep the metric under ${LIMITS.metric} characters.`
          : null,
  };
}

function NewGuard() {
  return (
    <WalletProviders>
      <NewGuardContent />
    </WalletProviders>
  );
}

const NewGuardRoute = createFileRoute("/app/guards/new")({
  component: NewGuard,
  validateSearch: (search: Record<string, unknown>): NewGuardSearch => ({
    guardId: typeof search.guardId === "string" && search.guardId.startsWith("grd_")
      ? search.guardId
      : undefined,
  }),
});

function NewGuardContent() {
  const navigate = useNavigate();
  const search = NewGuardRoute.useSearch() as NewGuardSearch;
  const persistedGuardHint = search.guardId;
  const { address, connector } = useAccount();
  const [step, setStep] = useState(0);
  const [id, setId] = useState<string | null>(null);
  const [motive, setMotive] = useState("");
  const [metric, setMetric] = useState("");
  const [kind, setKind] = useState<GuardrailKind>("MUST");
  const [railText, setRailText] = useState("");
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [touched, setTouched] = useState({ motive: false, metric: false });
  const fieldErrors = useMemo(() => motiveMetricErrors(motive, metric), [motive, metric]);
  const [error, setError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<Awaited<ReturnType<typeof preflightFn>> | null>(null);
  const [loopholes, setLoopholes] = useState<Awaited<ReturnType<typeof loopholeFn>> | null>(null);
  const [blueprint, setBlueprint] = useState<Awaited<ReturnType<typeof blueprintFn>> | null>(null);
  const persistIntentRef = useRef(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const persistedGuardQuery = useQuery({
    queryKey: ["guard", persistedGuardHint],
    queryFn: () => getGuardFn({ data: { id: persistedGuardHint! } }),
    enabled: Boolean(persistedGuardHint),
    retry: false,
  });

  useEffect(() => {
    if (id || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(PERSISTED_GUARD_HINT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        guardId?: string;
        motive?: string;
        metric?: string;
        guardrails?: Guardrail[];
      };
      // /app/guards/new is a new builder unless ?guardId= is explicit.
      // Auto-sending the user to a previous local draft skipped Protect and
      // made a Guard with no guardrails.
      if (draft.motive) setMotive(draft.motive);
      if (draft.metric) setMetric(draft.metric);
      if (Array.isArray(draft.guardrails)) setGuardrails(draft.guardrails);
    } catch {
      // A corrupt local draft must never block the builder.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, persistedGuardHint]);

  useEffect(() => {
    if (id || typeof window === "undefined" || !address) return;
    if (!motive && !metric && !guardrails.length) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(PERSISTED_GUARD_HINT_KEY, JSON.stringify({ guardId: id, motive, metric, guardrails }));
        setDraftSaved(true);
      } catch {
        // Best effort only: this is a convenience copy, never authoritative.
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [id, address, motive, metric, guardrails]);

  useEffect(() => {
    if (persistedGuardQuery.data?.guard.id) {
      void navigate({
        to: "/app/guards/$id",
        params: { id: persistedGuardQuery.data.guard.id },
        replace: true,
      });
    }
  }, [navigate, persistedGuardQuery.data?.guard.id]);

  const persist = useMutation({
    mutationFn: async () => {
      if (!address || !connector) throw new Error("Connect a wallet to save this Guard.");
      await ensureWalletSession(address, connector);
      auditUiAction({ actionName: id ? "guard_definition_updated" : "guard_builder_saved", resourceId: id });
      const payload = { motive, metric, guardrails };
      if (!id) {
        const res = await createGuardFn({ data: payload });
        setId(res.guard.id);
        try {
          const raw = window.localStorage.getItem(PERSISTED_GUARD_HINT_KEY);
          if (raw) {
            const draft = JSON.parse(raw) as { guardId?: string };
            window.localStorage.setItem(PERSISTED_GUARD_HINT_KEY, JSON.stringify({ ...draft, guardId: res.guard.id }));
          }
        } catch {
          // Route recovery does not depend on this convenience hint.
        }
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

  /**
   * Clicking a suggestion creates an editable Guardrail row immediately in
   * inline edit state — no redundant second "Add" click (H3). The user keeps
   * full control of the final text.
   */
  function addSuggestion(suggestion: (typeof SUGGESTED_GUARDRAILS)[number]) {
    setGuardrails((current) => [...current, { kind: suggestion.kind, text: suggestion.text }]);
    setEditingIndex(guardrails.length);
    setError(null);
    window.requestAnimationFrame(() => {
      const input = document.getElementById("rail-edit");
      input?.focus();
      if (input instanceof HTMLInputElement) input.select();
    });
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
        <div className="mt-1">
          <h1 className="font-display text-4xl tracking-tight">Define what success means.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">
            A Guard records the outcome you want, the number you will measure, and what the
            agent must not sacrifice to reach it.
          </p>
        </div>
        <Stepper kind="builder" current={step} className="mt-7" />

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
                    onBlur={() => setTouched((current) => ({ ...current, motive: true }))}
                    placeholder="Generate genuine qualified sales opportunities from the declared ICP."
                    aria-invalid={touched.motive && Boolean(fieldErrors.motive) || undefined}
                    aria-describedby="motive-count motive-error"
                  />
                  <p className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-graphite">
                    <span id="motive-count" className="tabular-nums" aria-live="polite">{LIMITS.motive - motive.length} characters left</span>
                  </p>
                  <FieldError>{touched.motive ? fieldErrors.motive : null}</FieldError>
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
                    onBlur={() => setTouched((current) => ({ ...current, metric: true }))}
                    placeholder="Book 80 meetings this week."
                    aria-describedby="metric-help metric-count metric-error"
                    aria-invalid={touched.metric && Boolean(fieldErrors.metric) || undefined}
                  />
                  <p id="metric-help" className="mt-1 text-xs text-graphite">A metric is useful. It is not the whole motive.</p>
                  <p id="metric-count" className="mt-1 text-xs text-graphite tabular-nums" aria-live="polite">{LIMITS.metric - metric.length} characters left</p>
                  <FieldError>{touched.metric ? fieldErrors.metric : null}</FieldError>
                </fieldset>
              </div>
              <div className="mt-7 border-l-2 border-brand pl-4 text-sm text-graphite">
                The useful tension is intentional: the metric is what gets counted; the motive is what still matters when the count goes up.
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section aria-labelledby="protect-title">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-ochre">Protect the outcome</p>
              <h2 id="protect-title" className="mt-2 font-display text-3xl tracking-tight">What must not be sacrificed?</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">
                Add quality, scope, cost, safety, or compliance constraints. Picking a suggestion adds an editable Guardrail row you can change or remove before saving.
              </p>

              <div className="mt-7">
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-graphite">Suggested guardrails</p>
                <p className="mt-1 text-xs text-graphite">
                  Adding a suggestion creates an editable row immediately. Nothing is final until you save.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTED_GUARDRAILS.map((suggestion) => (
                    <button
                      key={suggestion.label}
                      type="button"
                      className="min-h-11 rounded-sm border border-rule bg-card px-3 text-sm text-carbon transition-colors hover:border-ochre hover:bg-ochre-soft"
                      onClick={() => addSuggestion(suggestion)}
                    >
                      + {suggestion.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-7 border-t border-rule pt-5">
                <div className="mm-segmented" role="radiogroup" aria-label="Guardrail category">
                  {(["MUST", "QUALITY"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={kind === value}
                      onClick={() => setKind(value)}
                      className="mm-segmented-option"
                      data-selected={kind === value}
                    >
                      {value === "MUST" ? "Must not happen" : "Quality to preserve"}
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
                    {editingIndex === index ? (
                      <span className="flex min-w-0 flex-1 flex-col gap-2">
                        <Input
                          id="rail-edit"
                          value={guardrail.text}
                          maxLength={LIMITS.guardrailText}
                          aria-label={`Edit guardrail ${index + 1}`}
                          onChange={(event) =>
                            setGuardrails((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, text: event.target.value } : item,
                              ),
                            )
                          }
                        />
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="mm-segmented" role="radiogroup" aria-label={`Guardrail ${index + 1} category`}>
                            {(["MUST", "QUALITY"] as const).map((value) => (
                              <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={guardrail.kind === value}
                                data-selected={guardrail.kind === value}
                                className="mm-segmented-option"
                                onClick={() =>
                                  setGuardrails((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index ? { ...item, kind: value } : item,
                                    ),
                                  )
                                }
                              >
                                {value === "MUST" ? "Must not happen" : "Quality to preserve"}
                              </button>
                            ))}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!guardrail.text.trim()}
                            onClick={() => {
                              setGuardrails((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, text: item.text.trim() } : item,
                                ),
                              );
                              setEditingIndex(null);
                            }}
                          >
                            Done
                          </Button>
                        </span>
                      </span>
                    ) : (
                      <span className="min-w-0 text-sm">
                        <Badge tone={guardrail.kind === "MUST" ? "danger" : "success"}>{guardrail.kind}</Badge>
                        <span className="ml-2">{guardrail.text}</span>
                      </span>
                    )}
                    <span className="flex shrink-0 items-center gap-1">
                      {editingIndex === index ? null : (
                        <button
                          type="button"
                          className="inline-flex min-h-11 items-center gap-1 text-sm text-graphite underline-offset-4 hover:text-carbon hover:underline"
                          onClick={() => setEditingIndex(index)}
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        className="min-h-11 shrink-0 text-sm text-graphite underline-offset-4 hover:text-carbon hover:underline"
                        onClick={() => {
                          setGuardrails(guardrails.filter((_, itemIndex) => itemIndex !== index));
                          setEditingIndex(null);
                        }}
                      >
                        Remove
                      </button>
                    </span>
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
                        <p className="font-mono text-xs uppercase tracking-[0.12em] text-graphite">Motive preflight · advisory</p>
                        <Badge tone={advisoryTone(preflight.report.state)}>{advisoryLabel(preflight.report.state)}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-graphite">
                        Editor guidance only. This is not a GenLayer finding, consensus, or verdict.
                      </p>
                      <ul className="mt-3 space-y-3 text-sm">
                        {preflight.report.issues.length ? preflight.report.issues.map((issue) => <li key={issue.title}><strong>{issue.title}.</strong> {issue.detail}</li>) : <li>No motive-definition issues found.</li>}
                      </ul>
                      {preflight.report.recommendedGuardrails.length ? <div className="mt-4 border-t border-rule pt-3"><p className="text-xs text-graphite">Possible additions</p><div className="mt-2 flex flex-wrap gap-2">{preflight.report.recommendedGuardrails.map((guardrail) => <Button key={guardrail.text} size="sm" variant="outline" onClick={() => addSuggestion({ label: guardrail.text, kind: guardrail.kind, text: guardrail.text })}>{guardrail.text.slice(0, 42)}</Button>)}</div></div> : null}
                    </div>
                  ) : <p className="text-sm text-graphite">Running advisory checks…</p>}
                  {loopholes ? (
                      <div className="border-t border-rule pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-mono text-xs uppercase tracking-[0.12em] text-graphite">Loophole scan · advisory</p>
                          <Badge tone={loopholes.report.loopholes.length ? "warning" : "success"}>
                            {loopholes.report.loopholes.length ? "Caution" : "Info"}
                          </Badge>
                        </div>
                        <ul className="mt-3 space-y-3 text-sm">
                          {loopholes.report.loopholes.slice(0, 3).map((loophole) => (
                            <li key={loophole.title}><strong>{loophole.title}.</strong> {loophole.description}</li>
                          ))}
                          {!loopholes.report.loopholes.length ? <li>No obvious loophole surfaced.</li> : null}
                        </ul>
                      </div>
                    ) : null}
                </div>
              </div>
              {blueprint ? <TechnicalDetails className="mt-8" title="Evidence blueprint (advisory)"><div className="space-y-3 text-sm"><div><p className="font-medium">Required evidence</p><ul className="mt-1 list-disc space-y-1 pl-5 text-graphite">{blueprint.report.required.map((item) => <li key={item}>{item}</li>)}</ul></div><div><p className="font-medium">Recommended evidence</p><ul className="mt-1 list-disc space-y-1 pl-5 text-graphite">{blueprint.report.recommended.map((item) => <li key={item}>{item}</li>)}</ul></div></div></TechnicalDetails> : null}
            </section>
          ) : null}

          {step === 3 ? (
            <section aria-labelledby="publish-title">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-ochre">Make the objective durable</p>
              <h2 id="publish-title" className="mt-2 font-display text-3xl tracking-tight">Publish the Guard</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">
                Publishing creates the Guard on GenLayer. Locking is a separate transaction that freezes the Motive,
                Metric, and Guardrails so they cannot be rewritten after seeing the result.
              </p>
              <div className="mt-7">
                {id && guardQ.isLoading ? <p className="text-sm text-graphite">Loading the saved definition…</p> : null}
                {id && !guardQ.isLoading ? <CreateAndLock guardId={id} motive={motive} metric={metric} guardrails={guardrails} onchainId={guardQ.data?.guard.onchainId ?? null} txCreate={guardQ.data?.guard.txCreate ?? null} txArm={guardQ.data?.guard.txArm ?? null} locked={guardQ.data?.guard.status === "ARMED" || guardQ.data?.guard.status === "EVIDENCE_SUBMITTED" || guardQ.data?.guard.status === "RESOLVED"} onUpdated={() => void guardQ.refetch()} /> : null}
                {!id ? <p className="text-sm text-graphite">Save the definition before publishing.</p> : null}
              </div>

            </section>
          ) : null}

          <FieldError>{error}</FieldError>
          {draftSaved && !id ? (
            <p className="mt-3 text-xs text-graphite" role="status">
              Draft saved locally in this browser. Nothing is stored on-chain or on the server yet.
            </p>
          ) : null}
          <div className="mt-9 flex flex-wrap gap-3">
            {step > 0 ? (
              /* N7: the shared back affordance, with a verb-led label naming
                 the destination instead of a bare "Back". */
              <BackButton onClick={() => setStep((current) => current - 1)} label={`Back to ${STEPS[step - 1]}`} />
            ) : (
              <Link to="/app"><Button variant="ghost">Cancel</Button></Link>
            )}
            {step < 3 ? <Button
              loading={persist.isPending || persistIntentRef.current}
              loadingLabel="Saving…"
              disabled={persist.isPending || persistIntentRef.current}
              onClick={() => void goNext()}
            >
              {step === 0 ? "Save definition" : step === 1 ? "Review guard" : "Continue to publish"}
              <ArrowRight className="size-4" />
            </Button> : null}
          </div>
          {step === 3 && id && guardQ.data?.guard.status === "ARMED" ? <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-sage"><Check className="size-4" aria-hidden="true" /> Guard locked.<Button size="sm" variant="ghost" onClick={() => void navigate({ to: "/app/guards/$id", params: { id } })}>{CTA.openCase}</Button></div> : null}
        </div>
      </div>
    </AppShell>
  );
}
