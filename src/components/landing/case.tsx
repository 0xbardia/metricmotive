import { VerdictSummary } from "@/components/ui/verdict-summary";
import { D1 } from "@/lib/d1-case";
import { formatUtc } from "@/lib/format";
import { CopyValue } from "./copy-value";
import { H2, Kicker, LiveLink, SECTION, TextLink } from "./parts";

const CARD = "glass-dark glass-flat rounded-lg p-5 sm:p-6";
const LABEL = "font-mono text-xs uppercase tracking-[0.14em] text-ochre";
const H3 = "mt-1 font-display text-xl font-semibold";

const f = D1.findings;
const ROWS: [string, string][] = [
  ["Motive advanced", f.goal_advanced ? "Yes" : "No"],
  ["Metric target reached", f.metric_satisfied ? "Yes" : "No"],
  ["Material guardrail violation", f.material_violation ? "Detected" : "Not detected"],
  ["Circumvention", f.circumvention_detected ? "Detected" : "Not detected"],
  ["Evidence sufficient", f.evidence_sufficient ? "Yes" : "No"],
];
const pattern = D1.pattern.charAt(0) + D1.pattern.slice(1).toLowerCase().replace(/_/g, " ");

function Step({ n, title, children, wide = false }: { n: string; title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <li className={wide ? `${CARD} md:col-span-2` : CARD}>
      <p className={LABEL}>{n}</p>
      <h3 className={H3}>{title}</h3>
      <div className="mt-3 space-y-3 text-base text-bone">{children}</div>
    </li>
  );
}

export default function Case() {
  return (
    <section id="case" data-tone="dark" aria-labelledby="case-title" className="ambient-dark text-bone">
      <div className={SECTION}>
        <Kicker dark>02</Kicker>
        <h2 id="case-title" className={H2}>
          A real case
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-bone/90">
          A real run on GenLayer Studio Dev: Guard #{D1.guardId}, checked by independent validators.
        </p>
        <ol className="mt-8 grid gap-4 md:grid-cols-2">
          <Step n="01" title="Motive">
            <p>{D1.motive}</p>
            <LiveLink dark />
          </Step>
          <Step n="02" title="Metric">
            <p>{D1.metric}</p>
            <LiveLink dark />
          </Step>
          <Step n="03" title="Guardrails">
            <ul className="space-y-3">
              {D1.guardrails.map((g) => (
                <li key={g.text}>
                  <span className="font-mono text-xs uppercase tracking-wide text-ochre">
                    {g.kind === "MUST" ? "Must not happen" : "Quality to preserve"}
                  </span>
                  <p>{g.text}</p>
                </li>
              ))}
            </ul>
            <LiveLink dark />
          </Step>
          <Step n="04" title="What the agent did">
            <p>The agent booked {D1.counts.booked} calendar-confirmed meetings in the test week.</p>
            <ul className="list-disc space-y-1 pl-5">
              {D1.events.map((e) => (
                <li key={e.data.category}>{e.data.observation}</li>
              ))}
            </ul>
            <p className="text-sm text-bone/85">
              Recorded as captured. These observations may overlap, so they are not added or subtracted into one total.
            </p>
            <LiveLink dark />
          </Step>
          <Step n="05" title="What the validators found">
            <dl className="divide-y divide-bone/20">
              {ROWS.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2">
                  <dt>{k}</dt>
                  <dd className="shrink-0 font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <p>Pattern: {pattern}</p>
          </Step>
          <Step n="06" title="Verdict">
            <VerdictSummary verdict={D1.verdict} tone="dark" />
            <p className="text-bone/90">
              A fixed rule in the contract turns the findings into the verdict, so nobody can talk it into a different answer.
            </p>
          </Step>
          <Step n="07" title="Receipt" wide>
            <p className="font-medium">Guard #{D1.guardId}</p>
            <p className="flex items-center gap-2">
              <span className="text-bone/85">Contract</span>
              <CopyValue value={D1.contract} label="Copy contract address" />
            </p>
            <p>Resolved on-chain {formatUtc(D1.at.resolved)}</p>
            <div className="flex flex-wrap gap-x-5">
              <TextLink to={D1.receiptPath} dark>
                Open the Motive Receipt
              </TextLink>
              <LiveLink dark />
            </div>
          </Step>
        </ol>
        <p className="mt-6 text-sm text-bone/85">Studio Dev is a development network, not mainnet.</p>
      </div>
    </section>
  );
}
