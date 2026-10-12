// Preloaded into the app's Node process (NODE_OPTIONS=--import <this file>).
// Redirects ONLY the GenLayer RPC host to the mock; everything else is untouched.
const RPC_HOST = "studio-dev.genlayer.com";
const MOCK = process.env.E2E_MOCK_URL || "http://127.0.0.1:4292";
const realFetch = globalThis.fetch;

globalThis.fetch = function patchedFetch(input, init) {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
    const url = new URL(raw);
    if (url.hostname === RPC_HOST) {
      const target = `${MOCK}/rpc`;
      const headers = new Headers(init?.headers ?? (typeof input === "object" ? input.headers : undefined));
      headers.set("x-mm-source", "server");
      if (typeof input === "object" && !(input instanceof URL) && !init) {
        return realFetch(new Request(target, input), { headers });
      }
      return realFetch(target, { ...init, headers });
    }
  } catch {
    // not a URL we understand: fall through
  }
  return realFetch(input, init);
};
console.error(`[e2e-shim] redirecting ${RPC_HOST} -> ${MOCK}/rpc`);
