import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useAccount } from "wagmi";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VerdictBadge } from "@/components/ui/verdict-badge";
import { Stepper } from "@/components/ui/stepper";
import { listGuardsFn, reconcileCreateFn } from "@/lib/server/actions";
import { ensureWalletSession } from "@/lib/wallet/auth-client";
import { WalletProviders } from "@/lib/wallet/provider";
import type { Guard } from "@/lib/domain";

export function AppHomeWithWallet() {
  return (
    <WalletProviders>
      <AppShell wallet={false}>
        <AppHomeContent />
      </AppShell>
    </WalletProviders>
  );
}

function AppHomeContent() {
  const { address, connector } = useAccount();
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ["guards", address],
    enabled: Boolean(address && connector),
    queryFn: async () => {
      if (!address || !connector) throw new Error("Connect a wallet to view your Guards.");
      await ensureWalletSession(address, connector);
      return listGuardsFn();
    },
  });
  const guards = q.data?.guards ?? [];
  const stats = q.data?.stats;

  useEffect(() => {
    if (!address || !connector || !q.data?.guards.length) return;
    const pendingCreate = q.data.guards.find((guard) => guard.txCreate && !guard.onchainId);
    if (!pendingCreate) return;
    let cancelled = false;
    void reconcileCreateFn({ data: { id: pendingCreate.id } })
      .then((result) => {
        if (!cancelled && result.state === "reconciled") {
          void queryClient.invalidateQueries({ queryKey: ["guards", address] });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [address, connector, q.data?.guards, queryClient]);

  return (
    <>
      <div className="max-w-4xl">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-graphite">Verification workspace</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl tracking-tight">Cases</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">Define what the agent should achieve, capture what happened, and let GenLayer verify the difference.</p>
          </div>
          <Link to="/app/guards/new"><Button>Create a Motive Guard<ArrowRight className="size-4" /></Button></Link>
        </div>
        <Stepper kind="lifecycle" current={0} className="mt-7" />
      </div>

      {!address || !connector ? (
        <section className="product-status paper-panel mt-9 max-w-3xl p-6" aria-labelledby="connect-title">
          <Badge tone="brand">Start here</Badge>
          <h2 id="connect-title" className="mt-3 font-display text-3xl tracking-tight">Connect a wallet to open your workspace.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">Your Guards and Runs are private to the wallet that created them. Public verification receipts remain readable without a wallet.</p>
        </section>
      ) : q.isLoading ? (
        <p className="mt-9 text-sm text-graphite" role="status">Loading your cases…</p>
      ) : q.isError ? (
        <div className="paper-panel mt-9 max-w-2xl p-6" role="alert">
          <p className="font-display text-2xl">We couldn’t load your cases right now.</p>
          <p className="mt-2 text-sm text-graphite">Your saved cases were not deleted. Confirm the wallet signature or try again.</p>
          <Button className="mt-4" variant="outline" onClick={() => void q.refetch()}>Try again</Button>
        </div>
      ) : (
        <>
          <section className="mt-9" aria-labelledby="history-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="font-mono text-[0.6875rem] uppercase tracking-[0.13em] text-graphite">Your history</p><h2 id="history-title" className="mt-1 font-display text-2xl">What has been verified.</h2></div>
              <p className="text-xs text-graphite">Finalized evaluations only · not a trust score</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-5">
              {[
                ["Finalized", stats?.counts.finalized ?? 0, "graphite"],
                ["Faithful", stats?.counts.FAITHFUL_SUCCESS ?? 0, "sage"],
                ["Gaming", stats?.counts.METRIC_GAMING ?? 0, "brick"],
                ["Partial", stats?.counts.PARTIAL_ALIGNMENT ?? 0, "ochre"],
                ["Unclear", stats?.counts.INSUFFICIENT_EVIDENCE ?? 0, "graphite"],
              ].map(([label, value, tone]) => <div key={String(label)} className="border-t border-rule pt-3"><p className="font-mono text-[0.64rem] uppercase tracking-[0.1em] text-graphite">{label}</p><p className={`mt-1 font-display text-3xl tabular-nums ${tone === "brick" ? "text-[var(--color-danger-text)]" : tone === "sage" ? "text-[var(--color-sage-text)]" : tone === "ochre" ? "text-ochre" : "text-carbon"}`}>{value}</p></div>)}
            </div>
          </section>
          {guards.length === 0 ? (
            <section className="product-status paper-panel mt-12 max-w-3xl p-6" aria-labelledby="empty-cases-title">
              <Badge tone="brand">First case</Badge>
              <h2 id="empty-cases-title" className="mt-3 font-display text-3xl tracking-tight">Start with the outcome, not the dashboard.</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-graphite">Create a Motive Guard to define what success should mean before an agent gets a chance to optimize the number.</p>
              <Link to="/app/guards/new" className="mt-5 inline-block"><Button>Create a Motive Guard<ArrowRight className="size-4" /></Button></Link>
            </section>
          ) : (
            <section className="mt-12" aria-labelledby="cases-title">
              <div className="flex items-center justify-between gap-3"><h2 id="cases-title" className="font-display text-2xl">Your Guards</h2><span className="font-mono text-xs text-graphite">{guards.length} case{guards.length === 1 ? "" : "s"}</span></div>
              <ul className="mt-4 divide-y divide-rule border-y border-rule">
                {guards.map((guard) => <GuardRow key={guard.id} guard={guard} />)}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

function GuardRow({ guard }: { guard: Guard }) {
  return (
    <li>
      <Link to="/app/guards/$id" params={{ id: guard.id }} className="group flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[0.64rem] uppercase tracking-[0.1em] text-graphite">v{guard.version}</span><Badge tone={guard.status === "RESOLVED" ? "success" : "neutral"}>{statusLabel(guard)}</Badge>{guard.recordClass === "DUPLICATE" ? <Badge tone="graphite">Duplicate · superseded</Badge> : null}</div><p className="mt-2 truncate font-display text-xl group-hover:text-ochre">{guard.motive || "Untitled motive"}</p><p className="mt-1 truncate text-sm text-graphite">{guard.metric || "No metric yet"}</p></div>
        <div className="flex items-center gap-3 sm:shrink-0"><VerdictBadge verdict={guard.verdict} /><span className="font-mono text-xs text-graphite">{nextStep(guard)}</span><ArrowRight className="size-4 text-graphite transition-transform group-hover:translate-x-1" /></div>
      </Link>
    </li>
  );
}

function statusLabel(guard: Guard): string {
  // N1 / N10: the list must not call a Guard locked on the strength of an ARMED
  // row alone. For an on-chain Guard the lock is proven by its transaction.
  const locked = lockIsAuthoritative(guard);
  if (guard.status === "RESOLVED") return "Verified";
  if (guard.txCreate && !guard.onchainId) return "Confirmation delayed";
  if (!locked) return guard.status === "DRAFT" && !guard.onchainId ? "Draft" : "Published · not locked";
  return { DRAFT: "Draft", ARMED: "Guard locked", EVIDENCE_SUBMITTED: "Evidence committed", RESOLVED: "Verified" }[
    guard.status
  ];
}

function nextStep(guard: Guard): string {
  if (guard.txCreate && !guard.onchainId) return "Check confirmation";
  if (!lockIsAuthoritative(guard)) return guard.onchainId ? "Lock the Guard" : "Publish and lock";
  if (guard.status === "ARMED") return "Start a Run";
  if (guard.status === "EVIDENCE_SUBMITTED") return "Verify";
  return guard.authority === "GENLAYER" ? "View verdict" : "View result";
}

/** Mirrors the lifecycle model: a LOCAL Guard locks locally, an on-chain one does not. */
function lockIsAuthoritative(guard: Guard): boolean {
  if (guard.status === "DRAFT") return false;
  if (guard.authority === "LOCAL") return true;
  return Boolean(guard.txArm);
}

export function AppHomeFallback() {
  return (
    <>
      <div className="max-w-4xl"><p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-graphite">Verification workspace</p><div className="mt-1 flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-display text-4xl tracking-tight">Cases</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">Define what the agent should achieve, capture what happened, and let GenLayer verify the difference.</p></div><Link to="/app/guards/new"><Button>Create a Motive Guard<ArrowRight className="size-4" /></Button></Link></div><Stepper kind="lifecycle" current={0} className="mt-7" /></div>
      <section className="product-status paper-panel mt-9 max-w-3xl p-6" aria-live="polite"><Badge tone="brand">Start here</Badge><h2 className="mt-3 font-display text-3xl tracking-tight">Connect a wallet to open your workspace.</h2><p className="mt-2 text-sm leading-relaxed text-graphite">Your Guards and Runs are private to the wallet that created them. Public verification receipts remain readable without a wallet.</p></section>
    </>
  );
}
