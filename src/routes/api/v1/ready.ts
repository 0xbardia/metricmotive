import { createFileRoute } from "@tanstack/react-router";
import { DEPLOYMENT } from "@/lib/contract";
import { getSql } from "@/lib/db";
import { requestId } from "@/lib/errors";

export const Route = createFileRoute("/api/v1/ready")({
  server: {
    handlers: {
      GET: async () => {
        const id = requestId();
        const contractConfigured = Boolean(
          DEPLOYMENT.readCertified && DEPLOYMENT.contractAddress,
        );
        try {
          const sql = await getSql();
          await sql`select 1 as ok`;
        } catch {
          return Response.json(
            {
              error: { code: "NOT_READY", message: "Database not ready" },
              requestId: id,
              db: false,
              contractConfigured,
            },
            { status: 503 },
          );
        }
        if (!contractConfigured) {
          return Response.json(
            {
              error: {
                code: "NOT_READY",
                message: "Studionet contract is not configured",
              },
              requestId: id,
              db: true,
              contractConfigured: false,
            },
            { status: 503 },
          );
        }
        return Response.json({
          status: "ready",
          requestId: id,
          db: true,
          contractConfigured: true,
          chainId: DEPLOYMENT.chainId,
        });
      },
    },
  },
});
