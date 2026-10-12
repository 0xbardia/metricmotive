import { H2, Kicker, SECTION } from "./parts";

const CARDS = [
  ["Agent builders", "Ship an agent with a definition of success it cannot quietly redefine."],
  ["Teams running autonomous agents", "Get a verdict on the outcome, not just a metric trend."],
  ["Auditors", "Check any result yourself from a public receipt and an open contract."],
] as const;

export default function Audience() {
  return (
    <section id="audience" data-tone="light" aria-labelledby="audience-title" className="ambient text-carbon">
      <div className={SECTION}>
        <Kicker>05</Kicker>
        <h2 id="audience-title" className={H2}>
          Who it's for
        </h2>
        <ul className="mt-8 grid gap-4 md:grid-cols-3">
          {CARDS.map(([title, body]) => (
            <li key={title} className="rounded-lg border border-border-strong p-5">
              <h3 className="font-display text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-base text-graphite">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
