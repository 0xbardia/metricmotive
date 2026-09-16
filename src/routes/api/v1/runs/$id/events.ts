import { createFileRoute } from "@tanstack/react-router";
import { AppError, errorBody, requestId } from "@/lib/errors";
import { clientKey, rateLimit, readBodyLimited, parseJsonText } from "@/lib/server/http-guard";
import { appendRunEvent } from "@/lib/server/repo";
import { authenticateMutation } from "@/lib/server/webhook-auth";
import { idempotent, requestFingerprint, requireIdempotencyKey } from "@/lib/server/idempotency";
import { eventRequestSchema, parseInput, parseRunEvent } from "@/lib/validation";

export const Route = createFileRoute("/api/v1/runs/$id/events")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const id = requestId();
        try {
          if (!rateLimit(`events:${clientKey(request)}`, 60)) {
            return Response.json(
              { error: { code: "RATE_LIMIT", message: "Too many requests" }, requestId: id },
              { status: 429 },
            );
          }
          const raw = await readBodyLimited(request);
          const body = parseInput(eventRequestSchema, parseJsonText(raw), "Run event request is invalid");
          const event = parseRunEvent({
            ...body,
            type: body.type ?? "note",
            source: body.source ?? "api",
            data: body.data ?? {},
          });
          const identity = await authenticateMutation(request, raw);
          const key = requireIdempotencyKey(request, `run:${params.id}:body:${requestFingerprint(raw)}`);
          const run = await idempotent(
            `runs:event:${identity.address.toLowerCase()}`,
            key,
            requestFingerprint(raw),
            () => appendRunEvent(params.id, event, identity.address),
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
