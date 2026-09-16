import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requestId } from "@/lib/errors";
import { AppError } from "@/lib/errors";
import { clientKey, rateLimit, readBodyLimited, parseJsonText } from "@/lib/server/http-guard";
import { insertRun, listRunsForOwner } from "@/lib/server/repo";
import { authenticateMutation } from "@/lib/server/webhook-auth";
import { idempotent, requestFingerprint, requireIdempotencyKey } from "@/lib/server/idempotency";
import { parseRunCreate } from "@/lib/validation";

export const Route = createFileRoute("/api/v1/runs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = requestId();
        try {
          if (!rateLimit(`runs:${clientKey(request)}`, 30)) {
            return Response.json(
              { error: { code: "RATE_LIMIT", message: "Too many requests" }, requestId: id },
              { status: 429 },
            );
          }
          const identity = await authenticateMutation(request);
          const url = new URL(request.url);
          const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50) || 50, 1), 100);
          const offset = Math.max(Number(url.searchParams.get("offset") || 0) || 0, 0);
          const runs = await listRunsForOwner(identity.address, limit, offset);
          return Response.json({ runs, limit, offset, requestId: id });
        } catch (err) {
          const status = err instanceof AppError ? err.status : 500;
          return Response.json(errorBody(err, id), { status });
        }
      },
      POST: async ({ request }) => {
        const id = requestId();
        try {
          if (!rateLimit(`runs:${clientKey(request)}`, 30)) {
            return Response.json(
              { error: { code: "RATE_LIMIT", message: "Too many requests" }, requestId: id },
              { status: 429 },
            );
          }
          const raw = await readBodyLimited(request);
          const body = parseRunCreate(parseJsonText(raw));
          const identity = await authenticateMutation(request, raw);
          const key = requireIdempotencyKey(request, `body:${requestFingerprint(raw)}`);
          const run = await idempotent(
            `runs:create:${identity.address.toLowerCase()}`,
            key,
            requestFingerprint(raw),
            () => insertRun(body.guardId, body.agentRef ?? "api", identity.address),
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
