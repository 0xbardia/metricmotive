import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight } from "lucide-react";
import { TrajectoryViz } from "@/components/landing/trajectory";
import { Button } from "@/components/ui/button";

export function LandingHero() {
  return (
    <section className="hero-section bg-carbon text-bone" aria-labelledby="landing-title">
      <div className="hero-grid mx-auto grid min-h-[100svh] max-w-6xl items-center gap-10 px-4 pb-8 pt-24 sm:px-6 sm:pb-12 lg:gap-16 lg:pb-16 lg:pt-20">
        <div className="hero-copy">
          <div className="hero-kicker font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ochre">
            <span className="signal-dot" aria-hidden="true" />
            <span>Motive Control Room</span>
            <span className="hero-kicker-case">Case 002 / resolved</span>
          </div>
          <h1
            id="landing-title"
            className="mt-4 max-w-xl font-display text-[2.35rem] font-semibold leading-[1.02] tracking-tight sm:mt-5 sm:text-5xl lg:text-[4.1rem]"
          >
            Your agent hit the metric.
            <span className="hero-headline-muted mt-2 block">Did it honor the motive?</span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-bone/72 sm:mt-6">
            The score went up. The outcome got worse.
            <span className="block">Watch Guard #2 prove it.</span>
          </p>
        </div>
        <div className="hero-viz">
          <TrajectoryViz />
        </div>
        <div className="hero-cta">
          <div className="hero-actions mt-8 flex flex-wrap items-center gap-3 sm:mt-9">
            <Link to="/app/guards/new">
              <Button variant="ochre" size="lg">
                Create a Motive Guard
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <a href="#receipt">
              <Button variant="ghost" size="lg" className="text-bone hover:bg-bone/10">
                Inspect a real verdict
              </Button>
            </a>
          </div>
          <div className="hero-meta mt-9 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-bone/48">
            <span>Guard #2 / Metric gaming</span>
            <span>Hosted certification case</span>
            <span>Not user activity</span>
          </div>
        </div>
        <a className="hero-scroll" href="#product">
          <span>Follow the case</span>
          <ArrowDown className="size-4" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
