import { createFileRoute } from "@tanstack/react-router";
import { DEPLOYMENT } from "@/lib/contract";
import { requestId } from "@/lib/errors";

export const Route = createFileRoute("/api/v1/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          status: "ok",
          requestId: requestId(),
          contract: {
            certified: DEPLOYMENT.certified,
            address: DEPLOYMENT.contractAddress || null,
            chainId: DEPLOYMENT.chainId,
          },
        }),
    },
  },
});
