import { createFileRoute } from "@tanstack/react-router";
import { DEPLOYMENT, getActiveDeployment } from "@/lib/contract";
import { getSql } from "@/lib/db";
import { requestId } from "@/lib/errors";
import { guardProvenanceSchemaReady } from "@/lib/server/schema";

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
          const result = await sql<{ column_name: string }>`
            select
              column_name
            from information_schema.columns
            where table_schema = current_schema()
              and table_name = 'guards'
              and column_name in ('contract_address', 'chain_id', 'network')
          `;
          if (!guardProvenanceSchemaReady(result)) {
            throw new Error("Guard provenance schema is missing");
          }
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
                message: "Active Studio Dev contract is not configured",
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
          chainId: getActiveDeployment().chainId,
          network: getActiveDeployment().networkName,
          contractAddress: getActiveDeployment().contractAddress,
        });
      },
    },
  },
});
