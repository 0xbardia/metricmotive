import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/chrome";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/roadmap")({ component: RoadmapPage });

const PHASES: {
  id: string;
  title: string;
  status: "Planned" | "In Progress" | "Shipped";
  items: string[];
}[] = [
  {
    id: "01",
    title: "Motive Guard / V1",
    status: "Shipped" as const,
    items: [
      "Intelligent Contract",
      "Motive Lock",
      "Structured verdicts",
      "Evidence system",
      "Preflight and Loophole Scan",
      "Run Recorder",
      "Motive Receipt",
      "Studionet deployment",
      "Docs, HTTP API, and local TypeScript SDK",
    ],
  },
  {
    id: "02",
    title: "Developer layer",
    status: "Planned" as const,
    items: ["Richer adapters", "Expanded SDK", "Evidence connectors", "Appeal UX", "Automation hooks"],
  },
  {
    id: "03",
    title: "Agent integrations",
    status: "Planned" as const,
    items: ["Coding agents", "Sales agents", "Commerce agents", "Research agents", "Finance agents"],
  },
  {
    id: "04",
    title: "Motive history",
    status: "Planned" as const,
    items: ["Factual history from finalized evaluations. No arbitrary trust score."],
  },
  {
    id: "05",
    title: "Open Motive Protocol",
    status: "Planned" as const,
    items: [
      "Composable Guards",
      "Cross-platform verification",
      "Agent marketplace integration",
      "Agent-to-agent mandates",
    ],
  },
];

function RoadmapPage() {
  return (
    <div className="min-h-dvh bg-bone">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-4xl tracking-tight">Roadmap</h1>
        <p className="mt-3 text-graphite">
          No fake dates. Status is Planned, In Progress, or Shipped.
        </p>
        <ol className="mt-10 space-y-8">
          {PHASES.map((p) => (
            <li key={p.id} className="paper-panel p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-xs text-ochre">Phase {p.id}</p>
                <Badge
                  tone={
                    p.status === "Shipped" ? "sage" : p.status === "In Progress" ? "ochre" : "graphite"
                  }
                >
                  {p.status}
                </Badge>
              </div>
              <h2 className="mt-2 font-display text-2xl">{p.title}</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-graphite">
                {p.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </main>
      <SiteFooter />
    </div>
  );
}
