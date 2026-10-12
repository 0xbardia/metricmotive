import { D1 } from "@/lib/d1-case";
import { ROUTES } from "@/lib/site";
import { H2, Kicker, SECTION, TextLink } from "./parts";
import { ExternalLink } from "lucide-react";

export default function Trust() {
  return (
    <section id="trust" data-tone="dark" aria-labelledby="trust-title" className="ambient-dark text-bone">
      <div className={SECTION}>
        <Kicker dark>06</Kicker>
        <h2 id="trust-title" className={H2}>
          Trust
        </h2>
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          <li>
            <h3 className="font-display text-xl font-semibold">Consensus, not opinion</h3>
            <p className="mt-2 text-base text-bone/85">
              Independent GenLayer validators evaluate the evidence; their agreement is the finding.
            </p>
          </li>
          <li>
            <h3 className="font-display text-xl font-semibold">A receipt anyone can open</h3>
            <p className="mt-2 text-base text-bone/85">
              The verdict is written on-chain and the Motive Receipt page shows how it was reached.
            </p>
          </li>
          <li>
            <h3 className="font-display text-xl font-semibold">Open contract</h3>
            <p className="mt-2 text-base text-bone/85">Read the contract and its limits.</p>
            <div className="flex flex-wrap gap-x-5">
              <TextLink to={ROUTES.contract} dark>
                Contract and limits
              </TextLink>
              <a
                href={D1.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ochre underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ochre"
              >
                View it on the explorer
                <ExternalLink className="size-3.5" aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </div>
          </li>
        </ul>
        <p className="mt-8 max-w-2xl text-base text-bone/85">
          Studio Dev is a development network. Treat receipts there as demonstrations, not as mainnet guarantees.
        </p>
      </div>
    </section>
  );
}
