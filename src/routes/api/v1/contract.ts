import { createFileRoute } from "@tanstack/react-router";
import { DEPLOYMENT } from "@/lib/contract";
import { requestId } from "@/lib/errors";

export const Route = createFileRoute("/api/v1/contract")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          requestId: requestId(),
          ...DEPLOYMENT,
        }),
    },
  },
});
