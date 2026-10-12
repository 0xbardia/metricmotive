import { H2, Kicker, SECTION } from "./parts";

const STEPS = [
  ["Specify", "Write the motive, the metric and the guardrails. Lock them so they cannot be rewritten after the result is known."],
  ["Stress-test", "Look for loopholes in the definition before the agent runs."],
  ["Capture", "Record what the agent actually did, in plain language."],
  ["Verify", "Independent GenLayer validators agree on the findings. The contract turns them into a verdict."],
  ["Learn", "Use the receipt to tighten the next Guard."],
] as const;

export default function HowItWorks() {
  return (
    <section id="how-it-works" data-tone="light" aria-labelledby="how-title" className="ambient text-carbon">
      <div className={SECTION}>
        <Kicker>04</Kicker>
        <h2 id="how-title" className={H2}>
          How it works
        </h2>
        <p className="mt-4 max-w-2xl text-lg">Five steps from a vague goal to a checkable verdict.</p>
        <ol className="mt-8 grid gap-6 md:grid-cols-5">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="border-t-2 border-carbon pt-4">
              <p className="font-mono text-xs text-brand-text">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-1 font-display text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-base text-graphite">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
