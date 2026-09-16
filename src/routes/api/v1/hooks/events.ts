import { createFileRoute } from "@tanstack/react-router";
import { AppError, errorBody, requestId } from "@/lib/errors";
import { clientKey, rateLimit, readBodyLimited, parseJsonText } from "@/lib/server/http-guard";
import { appendRunEvent } from "@/lib/server/repo";
import { authenticateMutation } from "@/lib/server/webhook-auth";
import { idempotent, requestFingerprint, requireIdempotencyKey } from "@/lib/server/idempotency";
import { hookEventSchema, parseInput, parseRunEvent } from "@/lib/validation";

export const Route = createFileRoute("/api/v1/hooks/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const id = requestId();
        try {
          if (!rateLimit(`hooks:${clientKey(request)}`, 60)) {
            return Response.json(
              { error: { code: "RATE_LIMIT", message: "Too many requests" }, requestId: id },
              { status: 429 },
            );
          }
          const raw = await readBodyLimited(request);
          const body = parseInput(hookEventSchema, parseJsonText(raw), "Webhook event is invalid");
          const { runId, ...eventInput } = body;
          const event = parseRunEvent({
            ...eventInput,
            type: body.type ?? "webhook",
            source: body.source ?? "webhook",
            data: body.data ?? {},
          });
          const identity = await authenticateMutation(request, raw);
          const key = requireIdempotencyKey(request, `body:${requestFingerprint(raw)}`);
          const run = await idempotent(
            `hooks:event:${identity.address.toLowerCase()}`,
            key,
            requestFingerprint(raw),
            () => appendRunEvent(runId, event, identity.address),
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
