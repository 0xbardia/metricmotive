import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./chrome";

/**
 * Marketing shell for public narrative routes.
 *
 * Explicitly separate from <AppShell /> so a page can never accidentally stack
 * both navigation systems (H1). Marketing routes use the marketing header only.
 */
export function MarketingShell({
  children,
  invert = false,
  withFooter = true,
}: {
  children: ReactNode;
  invert?: boolean;
  withFooter?: boolean;
}) {
  return (
    <div className="min-h-dvh bg-bone text-carbon">
      <SiteHeader invert={invert} />
      <main>{children}</main>
      {withFooter ? <SiteFooter /> : null}
    </div>
  );
}
