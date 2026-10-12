import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing-shell";
import { Replay } from "@/components/demo/replay";
import { pageHead } from "@/lib/site";

export const Route = createFileRoute("/demo")({
  head: () => pageHead({ title: "Demo", path: "/demo" }),
  component: DemoPage,
});

function DemoPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-brand-text">Demo</p>
        <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">A real run, step by step</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-graphite">
          This is a read-only replay of a real run. Nothing here needs a wallet.
        </p>
        <Replay />
      </div>
    </MarketingShell>
  );
}
