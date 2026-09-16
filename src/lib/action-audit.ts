import { recordActionAuditFn } from "@/lib/server/actions";

export function auditUiAction(input: {
  actionName: string;
  resourceId?: string | null;
  idempotencyKey?: string | null;
}): void {
  if (typeof window === "undefined") return;
  const operationId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  void recordActionAuditFn({
    data: {
      actionName: input.actionName,
      resourceId: input.resourceId ?? null,
      route: window.location.pathname,
      idempotencyKey: input.idempotencyKey ?? null,
      operationId,
    },
  }).catch(() => undefined);
}
