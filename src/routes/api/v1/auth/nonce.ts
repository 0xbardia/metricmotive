import { createFileRoute } from "@tanstack/react-router";
import { AppError, errorBody, requestId } from "@/lib/errors";
import { issueWalletChallenge } from "@/lib/server/wallet-auth.server";
import { readJsonLimited } from "@/lib/server/http-guard";
import { clientKey, rateLimit } from "@/lib/server/http-guard";
import { parseInput, walletNonceRequestSchema } from "@/lib/validation";

export const Route = createFileRoute("/api/v1/auth/nonce")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const id = requestId();
        try {
          if (!rateLimit(`auth:${clientKey(request)}`, 10)) {
            throw new AppError("RATE_LIMIT", "Too many authentication attempts", 429);
          }
          const body = parseInput(walletNonceRequestSchema, await readJsonLimited(request), "Wallet challenge request is invalid");
          return Response.json({ ...await issueWalletChallenge(body.address), requestId: id });
        } catch (err) {
          const status = err instanceof AppError ? err.status : 400;
          return Response.json(errorBody(err, id), { status });
        }
      },
    },
  },
});
