import { createFileRoute } from "@tanstack/react-router";
import { AppError, errorBody, requestId } from "@/lib/errors";
import {
  expiredSessionCookie,
  getWalletSession,
  revokeWalletSession,
} from "@/lib/server/wallet-auth.server";

export const Route = createFileRoute("/api/v1/auth/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = requestId();
        try {
          const session = await getWalletSession(request);
          return Response.json({ address: session?.address ?? null, requestId: id });
        } catch (err) {
          const status = err instanceof AppError ? err.status : 400;
          return Response.json(errorBody(err, id), { status });
        }
      },
      DELETE: async ({ request }) => {
        const id = requestId();
        try {
          await revokeWalletSession(request);
          return new Response(JSON.stringify({ ok: true, requestId: id }), {
            headers: { "content-type": "application/json", "set-cookie": expiredSessionCookie() },
          });
        } catch (err) {
          const status = err instanceof AppError ? err.status : 400;
          return Response.json(errorBody(err, id), { status });
        }
      },
    },
  },
});
