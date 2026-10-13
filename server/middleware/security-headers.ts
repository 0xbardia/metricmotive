/**
 * Production security headers. Dev Vite HMR needs a looser policy, so CSP is
 * applied here (Nitro / deployed) rather than on the sandbox 8080 server.
 * Keep the browser policy limited to origins MetricMotive actually uses.
 */
import { buildCsp } from "../../src/lib/server/csp.ts";

function apply(headers: Headers): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  headers.set("X-DNS-Prefetch-Control", "off");
  // The server entry (src/server.ts) sets a nonce CSP on HTML; everything else gets the shared policy here.
  if (!headers.has("Content-Security-Policy")) headers.set("Content-Security-Policy", buildCsp());
}

export default async function securityHeadersMiddleware(
  _event: unknown,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const result = await next();
  if (result instanceof Response) {
    const headers = new Headers(result.headers);
    apply(headers);
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers,
    });
  }
  return result;
}
