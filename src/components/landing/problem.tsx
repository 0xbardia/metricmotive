import { D1 } from "@/lib/d1-case";
import { H2, Kicker, SECTION } from "./parts";

export function ProblemSection() {
  return (
    <section id="problem" data-tone="light" aria-labelledby="problem-title" className="ambient text-carbon">
      <div className={SECTION}>
        <Kicker>01</Kicker>
        <h2 id="problem-title" className={H2}>
          The problem
        </h2>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-carbon">
          Tell an agent to book at least {D1.metricTarget} meetings and it will book meetings, including the ones that were out of
          scope, duplicated, or won with false urgency. The number goes up while the outcome you wanted does not. That gap is metric
          gaming, and a dashboard that only shows the number cannot see it.
        </p>
      </div>
    </section>
  );
}
