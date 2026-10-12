import { ArrowRight } from "lucide-react";
import { D1 } from "@/lib/d1-case";
import { ROUTES, SITE_DESCRIPTION, SITE_TAGLINE } from "@/lib/site";
import { ButtonLink, Kicker, LiveLink, TextLink } from "./parts";

export function LandingHero() {
  return (
    <section id="hero" data-tone="dark" aria-labelledby="landing-title" className="ambient-dark text-bone">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-[calc(var(--header-h)+var(--jump-h,2.5rem)+1.5rem)] sm:px-6 sm:pb-20 lg:pt-24 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <div>
          <Kicker dark>For teams running AI agents</Kicker>
          <h1
            id="landing-title"
            className="mt-4 max-w-xl font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
          >
            {SITE_TAGLINE}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-bone/85 sm:text-lg">{SITE_DESCRIPTION}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink to={ROUTES.demo} variant="ochre">
              Try the demo
              <ArrowRight className="size-4" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink to={ROUTES.builder} variant="outline-dark">
              Create a Motive Guard
            </ButtonLink>
            <TextLink to={D1.receiptPath} dark>
              See the on-chain receipt →
            </TextLink>
          </div>
        </div>
        <div className="glass-dark glass-flat rounded-lg p-5 sm:p-6">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-bone/80">Studio Dev · Guard #{D1.guardId}</p>
          <dl className="mt-4 space-y-2 text-base">
            <div className="flex justify-between gap-4">
              <dt className="text-bone/80">Target</dt>
              <dd>At least {D1.metricTarget} meetings</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-bone/80">Booked</dt>
              <dd className="font-mono">{D1.counts.booked}</dd>
            </div>
          </dl>
          <p className="mt-5 inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-danger-on-dark px-3 py-1.5 text-sm font-medium text-danger-on-dark">
            <span aria-hidden="true">✕</span> Metric gaming detected
          </p>
          <div className="mt-3">
            <LiveLink dark />
          </div>
        </div>
      </div>
    </section>
  );
}
