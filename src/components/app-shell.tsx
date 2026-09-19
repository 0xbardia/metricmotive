import type { ReactNode } from "react";
import { lazy, Suspense } from "react";
import { SiteHeader } from "./chrome";

const WalletProviders = lazy(() =>
  import("@/lib/wallet/provider").then((module) => ({ default: module.WalletProviders })),
);

/**
 * App shell for authenticated/product routes.
 *
 * H1/H2: there is exactly ONE sticky nav system per route class. App routes
 * render the product header carrying APP navigation — not the marketing links
 * plus a second app bar, which is what stacked two nav systems on one screen.
 * Progress and steppers scroll beneath it instead of colliding with a second
 * sticky surface.
 */
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
      <div className="sticky top-0 z-30">
        <SiteHeader withWallet={showWallet} app />
      </div>
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
