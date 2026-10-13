import { QueryClient } from "@tanstack/react-query";

const make = () => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } });
let browserClient: QueryClient | undefined;

/** One client for the whole tree: per-call on the server (never shared across requests), singleton in the browser. */
export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return make();
  return (browserClient ??= make());
}
