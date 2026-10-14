import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { SiteFooter, SiteHeader } from "@/components/chrome";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { RouteEnter } from "@/components/route-enter";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { useState } from "react";
import { pageHead } from "@/lib/site";
// The stylesheet is a plain import so Start can collect it and inline it into the server-rendered HTML
// (`server.build.inlineCss` in vite.config.ts): one render-blocking request fewer on first load.
import "../styles.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#171816" },
      ...pageHead({ path: "/" }).meta,
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
      { rel: "preload", as: "font", type: "font/woff2", href: "/fonts/fraunces-opsz-wght-400-700.woff2", crossOrigin: "anonymous" },
      { rel: "preload", as: "font", type: "font/woff2", href: "/fonts/instrument-sans-wght-400-700.woff2", crossOrigin: "anonymous" },
    ],
  }),
  component: RootDocument,
  notFoundComponent: NotFoundPage,
});

function NotFoundPage() {
  return (
    <div className="min-h-dvh bg-bone text-carbon">
      <SiteHeader />
      <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col justify-center px-4 py-16 sm:px-6">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-brand-text">
          404 / case file missing
        </p>
        <h1 className="mt-3 font-display text-4xl tracking-tight">This route does not exist.</h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-graphite">
          The proof is unchanged. Return to MetricMotive and choose a published path.
        </p>
        <Link className="mt-6 text-sm underline underline-offset-4" to="/">
          Return to MetricMotive
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}

function RootDocument() {
  const routeKey = useRouterState({
    select: (s) => `${s.location.pathname}${s.location.searchStr}`,
  });
  const [queryClient] = useState(getQueryClient);
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-bone text-carbon">
        <PreviewHostBridge />
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <RouteEnter key={routeKey}>
              <Outlet />
            </RouteEnter>
          </QueryClientProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
