import type { ReactNode } from "react";
import { lazy, Suspense } from "react";
import { AppBar, SiteHeader } from "./chrome";

const WalletProviders = lazy(() =>
  import("@/lib/wallet/provider").then((module) => ({ default: module.WalletProviders })),
);

export function AppShell({
  children,
  wallet = true,
  withWallet = true,
}: {
  children: ReactNode;
  wallet?: boolean;
  withWallet?: boolean;
}) {
  const shell = (showWallet: boolean) => (
    <div className="min-h-dvh bg-bone text-carbon">
      <SiteHeader withWallet={showWallet} />
      <AppBar />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
  if (!wallet) return shell(withWallet);
  return (
    <Suspense fallback={shell(false)}>
      <WalletProviders>{shell(withWallet)}</WalletProviders>
    </Suspense>
  );
}
