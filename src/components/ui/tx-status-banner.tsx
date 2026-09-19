import type { ReactNode } from "react";
import { StatusBanner } from "@/components/ui/status-banner";
import { Button } from "@/components/ui/button";
import { IdBadge } from "@/components/ui/id-badge";
import { operationViewFromTx } from "@/lib/operations";
import type { TxState } from "@/lib/wallet/tx-state";

/**
 * The single status surface for a chain mutation.
 *
 * Composes <StatusBanner /> from the normalised operation model, so the wallet
 * panel, the route and the component layer cannot each render their own
 * competing message (C1 / M7).
 */
export function TxStatusBanner({
  state,
  onRetry,
  retryBusy = false,
  children,
}: {
  state: TxState;
  /** Reconciles the persisted hash. Must never resubmit a transaction. */
  onRetry?: () => void;
  retryBusy?: boolean;
  children?: ReactNode;
}) {
  const view = operationViewFromTx(state);
  if (!view) return null;

  const retry =
    view.retryMode === "reconcile" && onRetry ? (
      <Button
        variant="outline"
        loading={retryBusy}
        loadingLabel="Checking the network…"
        onClick={onRetry}
        data-action="retry-reconcile"
      >
        {view.retryLabel}
      </Button>
    ) : null;

  return (
    <StatusBanner
      status={view.status}
      severity={view.severity}
      title={view.title}
      message={
        <>
          {view.message}
          {view.diagnostic ? (
            <span className="mt-2 block text-graphite">{view.diagnostic}</span>
          ) : null}
        </>
      }
      action={retry}
      technicalDetails={
        view.txHash || view.technicalDetails ? (
          <dl>
            {view.txHash ? (
              <div>
                <dt>Transaction</dt>
                <dd>
                  <IdBadge value={view.txHash} kind="tx" />
                </dd>
              </div>
            ) : null}
            {view.technicalDetails ? (
              <div>
                <dt>Detail</dt>
                <dd>{view.technicalDetails}</dd>
              </div>
            ) : null}
          </dl>
        ) : undefined
      }
    >
      {children}
    </StatusBanner>
  );
}
