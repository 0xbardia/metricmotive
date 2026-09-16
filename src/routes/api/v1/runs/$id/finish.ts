import { createFileRoute } from "@tanstack/react-router";
import { AppError, errorBody, requestId } from "@/lib/errors";
import { clientKey, rateLimit, readBodyLimited, parseJsonText } from "@/lib/server/http-guard";
import { finishRun } from "@/lib/server/repo";
import { authenticateMutation } from "@/lib/server/webhook-auth";
import { idempotent, requestFingerprint, requireIdempotencyKey } from "@/lib/server/idempotency";
import { finishRequestSchema, parseInput, parseOutcome } from "@/lib/validation";

export const Route = createFileRoute("/api/v1/runs/$id/finish")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const id = requestId();
        try {
          if (!rateLimit(`finish:${clientKey(request)}`, 30)) {
            return Response.json(
              { error: { code: "RATE_LIMIT", message: "Too many requests" }, requestId: id },
              { status: 429 },
            );
          }
          const raw = await readBodyLimited(request);
          const body = parseInput(finishRequestSchema, parseJsonText(raw), "Run completion request is invalid");
          const outcome = parseOutcome(body.outcome ?? {});
          const identity = await authenticateMutation(request, raw);
          const key = requireIdempotencyKey(request, `run:${params.id}:body:${requestFingerprint(raw)}`);
          const run = await idempotent(
            `runs:finish:${identity.address.toLowerCase()}`,
            key,
            requestFingerprint(raw),
            () => finishRun(params.id, outcome, identity.address),
          );
          return Response.json({ run, requestId: id });
        } catch (err) {
          const status = err instanceof AppError ? err.status : 500;
          return Response.json(errorBody(err, id), { status });
        }
      },
    },
  },
});
