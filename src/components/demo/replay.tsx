import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ChevronsRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerdictSummary } from "@/components/ui/verdict-summary";
import { D1 } from "@/lib/d1-case";
import { GLOSSARY, GUARDRAIL_KIND_LABEL } from "@/lib/terminology";
import { cn } from "@/lib/cn";
import { ROUTES } from "@/lib/site";

const yesNo = (v: boolean) => (v ? "Yes" : "No");
const detected = (v: boolean) => (v ? "Detected" : "Not detected");

function OnChain() {
  return (
    <a
      href={D1.explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm text-brand-text underline underline-offset-4"
    >
      live on-chain <ExternalLink className="size-3" aria-hidden="true" />
    </a>
  );
}

const actionCls = "inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ochre";

type Step = { title: string; body: ReactNode };

const STEPS: Step[] = [
  { title: "Motive", body: <p className="text-lg leading-relaxed">{D1.motive}</p> },
  { title: "Metric", body: <p className="text-lg leading-relaxed">{D1.metric}</p> },
  {
    title: "Guardrails",
    body: (
      <ul className="space-y-3">
        {D1.guardrails.map((g) => (
          <li key={g.text}>
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-graphite">{GUARDRAIL_KIND_LABEL[g.kind]}</span>
            <p className="leading-relaxed">{g.text}</p>
          </li>
        ))}
      </ul>
    ),
  },
  {
    title: "What the agent did",
    body: (
      <>
        <p className="leading-relaxed">The agent booked {D1.counts.booked} calendar-confirmed meetings in the test week.</p>
        <ul className="mt-4 list-disc space-y-2 pl-5">
          {D1.events.map((e) => (
            <li key={e.data.observation} className="leading-relaxed">{e.data.observation}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-graphite">
          Recorded as captured. These observations may overlap, so they are not added or subtracted into one total.
        </p>
        <OnChain />
      </>
    ),
  },
  {
    title: "What the validators found",
    body: (
      <>
        <dl className="divide-y divide-rule border-y border-rule">
          {(
            [
              ["Motive advanced", yesNo(D1.findings.goal_advanced)],
              ["Metric target reached", yesNo(D1.findings.metric_satisfied)],
              ["Material guardrail violation", detected(D1.findings.material_violation)],
              ["Circumvention", detected(D1.findings.circumvention_detected)],
              ["Evidence sufficient", yesNo(D1.findings.evidence_sufficient)],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-2 py-3">
              <dt>{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4">Pattern: Constraint bypass</p>
        <OnChain />
      </>
    ),
  },
  {
    title: "Verdict",
    body: (
      <>
        <VerdictSummary verdict={D1.verdict} />
        <p className="mt-3 leading-relaxed text-graphite">
          A fixed rule in the contract turns the findings into the verdict, so nobody can talk it into a different answer.
        </p>
        <OnChain />
      </>
    ),
  },
  {
    title: "Receipt",
    body: (
      <>
        <p className="leading-relaxed">Guard #{D1.guardId} on {D1.network}.</p>
        <p className="mt-2 break-all font-mono text-xs text-graphite">{D1.contract}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link to={ROUTES.builder} className={cn(actionCls, "bg-carbon text-bone")}>
            Create a Motive Guard
          </Link>
          <Link to="/verify/$receiptId" params={{ receiptId: D1.receiptId }} className={cn(actionCls, "border border-border-strong text-carbon")}>
            Open the Motive Receipt
          </Link>
          <a href={D1.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm text-brand-text underline underline-offset-4">
            live on-chain <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </div>
      </>
    ),
  },
];

export function Replay() {
  const [i, setI] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const last = STEPS.length - 1;
  const go = (n: number) => setI(Math.min(last, Math.max(0, n)));
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [i]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "ArrowRight") setI((n) => Math.min(last, n + 1));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);
  return (
    <>
      <section aria-labelledby="demo-intro" className="paper-panel mt-8 p-5 sm:p-6">
        <h2 id="demo-intro" className="font-display text-xl tracking-tight">What am I looking at?</h2>
        <dl className="mt-3 grid gap-3 text-sm leading-relaxed text-graphite md:grid-cols-3">
          {(
            [
              ["Motive Guard", GLOSSARY.guard],
              ["Motive Check", GLOSSARY.check],
              ["Verdict", GLOSSARY.verdict],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="font-medium text-carbon">{k}</dt>
              <dd className="mt-1">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-label="Guided replay" className="glass glass-flat mt-6 p-5 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-brand-text">
            Step {i + 1} of {STEPS.length}
          </p>
          <button
            type="button"
            onClick={() => go(last)}
            disabled={i === last}
            className="inline-flex min-h-11 items-center gap-1 text-sm text-brand-text underline underline-offset-4 disabled:opacity-50"
          >
            Skip to the end <ChevronsRight className="size-4" aria-hidden="true" />
          </button>
        </div>
        <ol className="mt-2 grid grid-cols-7 gap-1" aria-label="Steps">
          {STEPS.map((st, n) => (
            <li key={st.title}>
              <button
                type="button"
                onClick={() => go(n)}
                aria-current={n === i ? "step" : undefined}
                aria-label={`Step ${n + 1}: ${st.title}`}
                className={cn(
                  "grid min-h-11 w-full place-items-center border-b-4 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre",
                  n === i ? "border-carbon font-bold text-carbon" : n < i ? "border-brand-text text-graphite" : "border-border-strong text-graphite",
                )}
              >
                {n < i ? "✓" : n + 1}
              </button>
            </li>
          ))}
        </ol>
        <p className="sr-only" aria-live="polite">
          Step {i + 1} of {STEPS.length}: {STEPS[i].title}
        </p>
        {/* All steps share one grid cell, so the card is always as tall as the tallest step (no layout shift). */}
        <div className="mt-6 grid">
          {STEPS.map((st, n) => (
            <div key={st.title} className={cn("col-start-1 row-start-1 min-w-0", n !== i && "invisible")} aria-hidden={n !== i || undefined}>
              <h2 ref={n === i ? heading : undefined} tabIndex={n === i ? -1 : undefined} className="font-display text-2xl tracking-tight outline-none sm:text-3xl">
                {st.title}
              </h2>
              <div className="mt-4">{st.body}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => go(i - 1)} disabled={i === 0}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Back
          </Button>
          <Button onClick={() => go(i + 1)} disabled={i === last}>
            Next <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <p className="mt-6 text-sm text-graphite">
          Keyboard: press the Left and Right arrow keys to move between steps. Studio Dev is a development network, not mainnet.
        </p>
      </section>
    </>
  );
}
