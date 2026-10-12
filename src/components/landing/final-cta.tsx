import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/motion";
import { Button } from "@/components/ui/button";

export function FinalCtaSection() {
  return (
    <section data-tone="light" className="bg-bone ambient text-carbon">
      <div className="glass mx-auto my-12 flex max-w-6xl flex-col gap-8 rounded-lg px-6 py-12 sm:px-10 lg:flex-row lg:items-end lg:justify-between">
        <Reveal>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-graphite">
            Shipped · Developer Layer · Agent Integrations · Open Motive Protocol
          </p>
          <h2 className="mt-4 max-w-xl font-display text-4xl tracking-tight">
            Define what success actually means.
          </h2>
        </Reveal>
        <div className="flex flex-wrap gap-3">
          <Link to="/app/guards/new">
            <Button size="lg">
              Create a Motive Guard
              <ArrowRight className="size-4" />
            </Button>
          </Link>
          <Link to="/roadmap">
            <Button size="lg" variant="outline">
              Roadmap
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
