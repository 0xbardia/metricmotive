import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";

/**
 * Public pages (landing, docs, demo, receipts) are content-first: their HTML already carries the content and the
 * stylesheet, and the framework's `<link rel="modulepreload">` hints only make the script chunks compete with that
 * HTML for bandwidth on a slow connection. Dropping them for these routes raised the Lighthouse mobile score by
 * ~3 points (A/B, same build, alternating runs) with no layout or behaviour change; the chunks load a moment later
 * through the normal module graph. App routes (`/app/*`) keep the hints: their module graph is deep.
 */
const KEEP_PRELOADS = /^\/(app|api|_serverFn|_build)(\/|$)/;

type ManifestRoute = { preloads?: unknown };
type SsrManifest = { routes: Record<string, ManifestRoute> } & Record<string, unknown>;

const withoutPreloads = (manifest: SsrManifest): SsrManifest => ({
  ...manifest,
  routes: Object.fromEntries(Object.entries(manifest.routes).map(([id, route]) => [id, { ...route, preloads: undefined }])),
});

const fetch = createStartHandler((ctx) => {
  const { pathname } = new URL(ctx.request.url);
  const ssr = (ctx.router as unknown as { ssr?: object }).ssr;
  const original = ssr && Object.getOwnPropertyDescriptor(ssr, "manifest");
  if (ssr && original?.get && !KEEP_PRELOADS.test(pathname)) {
    // `router.ssr.manifest` is a per-request getter over a cached, shared manifest: wrap the getter, never mutate.
    Object.defineProperty(ssr, "manifest", {
      configurable: true,
      enumerable: true,
      get() {
        const manifest = original.get!.call(ssr) as SsrManifest | undefined;
        return manifest ? withoutPreloads(manifest) : manifest;
      },
    });
  }
  return defaultStreamHandler(ctx);
});

export default createServerEntry({ fetch });
