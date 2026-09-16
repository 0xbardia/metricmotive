import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/chrome";
import { Reveal } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEPLOYMENT, LEGACY_DEPLOYMENT } from "@/lib/contract";
import { CERTIFIED_CASES } from "@/lib/cert-cases";
import { GENLAYER } from "@/lib/domain";
import { probeContractReadsFn } from "@/lib/server/actions";

export const Route = createFileRoute("/contract")({ component: ContractPage });

function ContractPage() {
  const probe = useQuery({
    queryKey: ["contract-reads", DEPLOYMENT.contractAddress],
    queryFn: () => probeContractReadsFn(),
    enabled: false,
    staleTime: 60_000,
  });

  return (
    <div className="min-h-dvh bg-bone">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-graphite">
          Intelligent Contract
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">MetricMotive</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {DEPLOYMENT.certified ? (
            <Badge tone="sage">Certified on Studionet</Badge>
          ) : (
            <Badge tone="ochre">Read interface verified · real-wallet test pending</Badge>
          )}
          <Badge tone="ink">v{DEPLOYMENT.contractVersion}</Badge>
        </div>
        <dl className="mt-8 space-y-3 text-sm">
          <Row k="Network" v={GENLAYER.network} />
          <Row k="Chain ID" v={String(GENLAYER.chainId)} />
          <Row k="RPC" v={GENLAYER.rpcUrl} />
          <Row k="Address" v={DEPLOYMENT.contractAddress} />
          <Row k="Previous deployment · legacy" v={LEGACY_DEPLOYMENT.contractAddress} />
          <Row k="Deploy tx" v={DEPLOYMENT.deployTx} />
          <Row k="Deployer" v={DEPLOYMENT.deployer} />
          <Row k="Source" v={DEPLOYMENT.source} />
          <Row k="Source SHA-256" v={DEPLOYMENT.sourceSha256} />
          <Row k="Studio" v={GENLAYER.studioUrl} />
          <Row
            k="Consensus"
            v={`${DEPLOYMENT.validatorsAgreed} validators agreed · ${DEPLOYMENT.execution}`}
          />
        </dl>
        <h2 className="mt-10 font-display text-2xl">Read methods</h2>
        <p className="mt-2 text-sm text-graphite">
          Verified on Studionet after deploy. Missing IDs return found:false
          instead of crashing. Run live reads to probe the certified address now.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => probe.refetch()}
            disabled={probe.isFetching}
          >
            {probe.isFetching ? "Reading…" : "Run live reads"}
          </Button>
          {probe.data ? (
            <Badge tone={probe.data.allPass ? "sage" : "brick"}>
              {probe.data.allPass
                ? `${probe.data.rows.length} PASS`
                : "Read failure"}
            </Badge>
          ) : (
            <Badge tone="sage">Read-only interface verified</Badge>
          )}
        </div>
        <ul className="mt-4 space-y-1 font-mono text-sm">
          {DEPLOYMENT.readMethods.map((name) => {
            const live = probe.data?.rows.find((r) => r.functionName === name);
            const tone = probe.isFetching
              ? "graphite"
              : live
                ? live.ok
                  ? "sage"
                  : "brick"
                : "sage";
            const label = probe.isFetching
              ? "Reading"
              : live
                ? live.ok
                  ? "PASS"
                  : "FAIL"
                : "PASS";
            return (
              <Reveal key={name} as="li">
                <div className="flex items-center justify-between gap-3 border-b border-rule py-2">
                  <span>{name}</span>
                  <Badge tone={tone}>{label}</Badge>
                </div>
              </Reveal>
            );
          })}
        </ul>
        {probe.error ? (
          <p className="mt-3 text-sm text-brick" role="alert">
            {probe.error instanceof Error ? probe.error.message : "Read probe failed"}
          </p>
        ) : null}
        <h2 className="mt-8 font-display text-2xl">Write methods</h2>
        <ul className="mt-3 space-y-1 font-mono text-sm">
          {DEPLOYMENT.writeMethods.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <h2 className="mt-10 font-display text-2xl">Certification cases</h2>
        <p className="mt-2 text-sm text-graphite">
          Historical evaluations on the previous deployment, not certification
          of the active contract. These are not user case files or a trust score.
        </p>
        <ul className="mt-4 space-y-4">
          {CERTIFIED_CASES.map((c) => (
            <li key={c.onchainId} className="paper-panel p-5">
              <p className="font-mono text-xs text-ochre">{c.label}</p>
              <p className="mt-2 font-display text-2xl">{c.verdict}</p>
              <p className="mt-1 text-sm text-graphite">
                Guard {c.onchainId} · {c.primaryPattern}
              </p>
              <p className="mt-3 text-sm">{c.motive}</p>
              <p className="mt-1 text-sm text-graphite">{c.metric}</p>
              <dl className="mt-4 space-y-1 font-mono text-xs">
                <div>create {c.createTx}</div>
                <div>arm {c.armTx}</div>
                <div>evidence {c.evidenceTx}</div>
                <div>evaluate {c.evaluateTx}</div>
              </dl>
              {"notes" in c && c.notes ? (
                <p className="mt-3 text-sm text-graphite">{c.notes}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-graphite">{k}</dt>
      <dd className="mt-1 break-all">{v}</dd>
    </div>
  );
}
