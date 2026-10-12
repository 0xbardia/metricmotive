import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { D1 } from "@/lib/d1-case";
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

const kindLabel = (k: "MUST" | "QUALITY") => (k === "MUST" ? "Must not happen" : "Quality to preserve");

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
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-graphite">{kindLabel(g.kind)}</span>
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
        <p className="text-lg font-medium text-danger-text">Metric gaming. The agent hit the metric but failed the motive.</p>
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
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1">
          <Link to="/verify/$receiptId" params={{ receiptId: D1.receiptId }} className="inline-flex min-h-11 items-center text-brand-text underline underline-offset-4">
            Open the Motive Receipt
          </Link>
          <a href={D1.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-brand-text underline underline-offset-4">
            live on-chain <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </div>
        <div className="mt-4">
          <Link to={ROUTES.builder}>
            <Button>Create a Motive Guard</Button>
          </Link>
        </div>
      </>
    ),
  },
];

export function Replay() {
  const [i, setI] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [i]);
  const step = STEPS[i];
  return (
    <section aria-label="Guided replay" className="glass glass-flat mt-8 p-5 sm:p-8">
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-brand-text">
        Step {i + 1} of {STEPS.length}
      </p>
      <div aria-live="polite">
        <h2 ref={heading} tabIndex={-1} className="mt-2 font-display text-2xl tracking-tight outline-none sm:text-3xl">
          {step.title}
        </h2>
        <div className="mt-4 min-w-0">{step.body}</div>
      </div>
      <div className="mt-8 flex items-center justify-between gap-3">
        <Button variant="outline" onClick={() => setI(i - 1)} disabled={i === 0}>
          <ArrowLeft className="size-4" aria-hidden="true" /> Back
        </Button>
        <Button onClick={() => setI(i + 1)} disabled={i === STEPS.length - 1}>
          Next <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <p className="mt-6 text-sm text-graphite">Studio Dev is a development network, not mainnet.</p>
    </section>
  );
}
