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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import appCss from "../styles.css?url";

const APP_NAME = "MetricMotive";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Did the agent honor the motive, or only hit the metric? MetricMotive verifies agent runs with GenLayer consensus.",
      },
      { name: "theme-color", content: "#171816" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500&family=Source+Sans+3:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap",
      },
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
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-ochre">
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
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } }),
  );
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-bone text-carbon">
        <PreviewHostBridge />
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <div key={routeKey} className="route-enter">
              <Outlet />
            </div>
          </QueryClientProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
