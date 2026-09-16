import { createFileRoute } from "@tanstack/react-router";
import { AppError, errorBody, requestId } from "@/lib/errors";
import {
  sessionCookie,
  verifyWalletChallenge,
} from "@/lib/server/wallet-auth.server";
import { readJsonLimited } from "@/lib/server/http-guard";
import { clientKey, rateLimit } from "@/lib/server/http-guard";
import { parseInput, walletVerifyRequestSchema } from "@/lib/validation";

export const Route = createFileRoute("/api/v1/auth/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const id = requestId();
        try {
          if (!rateLimit(`auth:${clientKey(request)}`, 10)) {
            throw new AppError("RATE_LIMIT", "Too many authentication attempts", 429);
          }
          const body = parseInput(walletVerifyRequestSchema, await readJsonLimited(request), "Wallet verification request is invalid");
          const result = await verifyWalletChallenge(body);
          return new Response(JSON.stringify({ address: result.address, requestId: id }), {
            headers: { "content-type": "application/json", "set-cookie": sessionCookie(result.token) },
          });
        } catch (err) {
          const status = err instanceof AppError ? err.status : 400;
          return Response.json(errorBody(err, id), { status });
        }
      },
    },
  },
});
