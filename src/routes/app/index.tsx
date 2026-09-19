import { lazy, Suspense, useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Stepper } from "@/components/ui/stepper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app/")({ component: AppHome });

const WalletDashboard = lazy(() =>
  import("@/components/app-home-content").then((module) => ({
    default: module.AppHomeWithWallet,
  })),
);

function AppHome() {
  const [walletReady, setWalletReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setWalletReady(true), 1000);
    return () => window.clearTimeout(id);
  }, []);
  const fallback = (
    <AppShell wallet={false} withWallet={false}>
      <AppHomeFallback />
    </AppShell>
  );
  if (!walletReady) return fallback;
  return (
    <Suspense fallback={fallback}>
      <WalletDashboard />
    </Suspense>
  );
}

function AppHomeFallback() {
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
      <section className="product-status paper-panel mt-9 max-w-3xl p-6" aria-live="polite">
        <Badge tone="ochre">Start here</Badge>
        <h2 className="mt-3 font-display text-3xl tracking-tight">Connect a wallet to open your workspace.</h2>
        <p className="mt-2 text-sm leading-relaxed text-graphite">Your Guards and Runs are private to the wallet that created them. Public verification receipts remain readable without a wallet.</p>
      </section>
    </>
  );
}

export default AppHome;
