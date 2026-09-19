import { Link } from "@tanstack/react-router";
import { Reveal } from "@/components/motion";
import { CopyValue } from "@/components/landing/copy-value";
import { VERDICT_TAXONOMY } from "@/components/landing/cert-case";
import { Button } from "@/components/ui/button";
import { DEPLOYMENT } from "@/lib/contract";
import { GENLAYER } from "@/lib/domain";

const PIPE = [
  { k: "Evidence", owner: "MetricMotive", d: "The run is committed as a fingerprint." },
  { k: "Semantic findings", owner: "GenLayer", d: "Independent validators interpret the facts." },
  { k: "Deterministic mapping", owner: "Contract", d: "Findings map to one of four verdicts." },
  { k: "Verdict", owner: "Public receipt", d: "No rewrite. The result is inspectable." },
] as const;

const VALIDATORS = ["A", "B", "C", "D"] as const;

export function GenLayerProofSection() {
  // Derived from the maintained verified-interface constant, never hardcoded —
  // if the interface changes, this count changes with it (L7).
  const readCount = DEPLOYMENT.readMethods.length;
  const reads = `${readCount}/${readCount}`;

  return (
    <section id="contract" className="bg-carbon text-bone">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <Reveal>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ochre">
            05 — Verify
          </p>
          <h2 className="mt-3 max-w-2xl font-display text-4xl tracking-tight">
            MetricMotive prepares evidence. GenLayer judges the meaning.
          </h2>
          <p className="mt-4 max-w-xl text-bone/70">
            Validators can disagree on wording. They must agree on structured findings. The contract
            then resolves the verdict without another vote.
          </p>
        </Reveal>

        <ol className="pipeline-flow mt-12">
          {PIPE.map((step, i) => (
            <Reveal key={step.k} delay={i * 70} as="li" className="pipeline-step">
              <div className="pipeline-step-number font-mono text-[0.65rem] uppercase tracking-[0.14em] text-ochre">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="pipeline-step-copy">
                <p className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-bone/62">
                  {step.owner}
                </p>
                <h3 className="mt-2 font-display text-2xl">{step.k}</h3>
                <p className="mt-2 text-sm text-bone/65">{step.d}</p>
              </div>
            </Reveal>
          ))}
        </ol>

        <div
          className="consensus-figure mt-14"
          aria-label="Independent validators converged on one structured finding"
        >
          <div>
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-bone/62">
              Distributed adjudication
            </p>
            <p className="mt-2 max-w-sm text-sm text-bone/70">
              Independent validators converged on the same structured finding.
            </p>
          </div>
          <div className="consensus-layout mt-6">
            <ul className="consensus-lanes" aria-label="Validator agreement">
              {VALIDATORS.map((lane) => (
                <li key={lane} className="consensus-lane">
                  <span className="consensus-lane-key">Validator {lane}</span>
                  <span>agreed</span>
                </li>
              ))}
            </ul>
            <div className="consensus-convergence">
              <span className="consensus-convergence-line" aria-hidden="true" />
              <span className="consensus-convergence-label font-mono text-[0.62rem] uppercase tracking-[0.12em]">
                structured finding
              </span>
              <strong className="font-mono text-sm text-ochre">
                metric_satisfied · goal_not_advanced
              </strong>
            </div>
          </div>
          <p className="mt-5 max-w-xl text-sm text-bone/70">
            GenLayer handles semantic agreement. The contract handles finality.
          </p>
          <p className="mt-2 max-w-xl text-xs text-bone/55">
            Individual validator wording is not published. MetricMotive shows only the structured finding
            the validators agreed on, so nothing here is a reconstructed quote.
          </p>
        </div>

        <Reveal>
          <div className="proof-strip mt-16">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-ochre">
              Technical details
            </p>
            <dl className="proof-grid mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt>Network</dt>
                <dd>{GENLAYER.network}</dd>
              </div>
              <div>
                <dt>Chain ID</dt>
                <dd>{GENLAYER.chainId}</dd>
              </div>
              <div>
                <dt>Contract</dt>
                <dd>
                  <CopyValue
                    value={DEPLOYMENT.contractAddress}
                    label="contract address"
                    className="text-bone"
                  />
                </dd>
              </div>
              <div>
                <dt>Reads</dt>
                <dd>
                  <span title="Public contract read methods verified against the deployed interface.">
                    {reads}
                  </span>{" "}
                  <span className="text-bone/55">
                    verified public contract read methods
                  </span>
                </dd>
              </div>
              <div>
                <dt>Legacy Guard 1</dt>
                <dd>FAITHFUL_SUCCESS</dd>
              </div>
              <div>
                <dt>Legacy Guard 2</dt>
                <dd>METRIC_GAMING</dd>
              </div>
            </dl>
            <Link to="/contract" className="mt-6 inline-block">
              <Button variant="ghost" className="text-bone hover:bg-bone/10">
                Technical details
              </Button>
            </Link>
          </div>
        </Reveal>

        <div className="verdict-field mt-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-bone/62">
                Verdict taxonomy
              </p>
              <p className="mt-2 max-w-md text-sm text-bone/65">
                Four outcomes. One deterministic mapping.
              </p>
            </div>
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-[var(--color-danger-on-dark)]">
              Legacy Guard #2 → METRIC_GAMING
            </p>
          </div>
          <ul className="verdict-spectrum mt-7">
            {VERDICT_TAXONOMY.map((item) => (
              <li
                key={item.id}
                className="verdict-cell"
                data-active={item.id === "METRIC_GAMING"}
                title={item.meaning}
              >
                <span className="verdict-cell-index font-mono text-[0.62rem] text-bone/60">
                  0{VERDICT_TAXONOMY.indexOf(item) + 1}
                </span>
                <p className="font-mono text-xs tracking-[0.08em]">{item.id}</p>
                <p className="mt-2 text-sm text-bone/65">{item.meaning}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
