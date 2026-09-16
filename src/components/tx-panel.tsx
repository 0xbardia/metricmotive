import { Badge } from "@/components/ui/badge";
import { GENLAYER } from "@/lib/domain";
import { shortHex } from "@/lib/format";
import { type TxState, txLabel } from "@/lib/wallet/tx-state";

export function TxPanel({ state }: { state: TxState }) {
  if (state.phase === "idle") return null;
  const tone =
    state.phase === "success"
      ? "sage"
      : state.phase === "failed" || state.phase === "rejected"
        ? "brick"
        : state.phase === "wrong-network" || state.phase === "need-wallet"
          ? "ochre"
          : "graphite";
  return (
    <div className="paper-panel p-4" data-tx-phase={state.phase} role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{phaseLabel(state.phase)}</Badge>
      </div>
      <p className="mt-2 text-sm">{txLabel(state)}</p>
      {state.error ? (
        <p className="mt-2 text-sm text-brick">{state.error}</p>
      ) : null}
      {state.hash || state.originAddress ? (
        <details className="mt-3 technical-details">
          <summary>Technical details</summary>
          <div className="technical-details-body">
            <dl>
              {state.action ? <div><dt>Contract method</dt><dd>{state.action}</dd></div> : null}
              {state.hash ? <div><dt>Transaction</dt><dd className="flex flex-wrap items-center gap-2">{shortHex(state.hash, 8)}<span className="text-ochre">{GENLAYER.network}</span></dd></div> : null}
              {state.originAddress ? <div><dt>Originating wallet</dt><dd>{shortHex(state.originAddress, 6)}{state.originChainId ? ` · chain ${state.originChainId}` : ""}</dd></div> : null}
              {state.resourceId ? <div><dt>Local resource</dt><dd>{state.resourceId}</dd></div> : null}
            </dl>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function phaseLabel(phase: TxState["phase"]): string {
  switch (phase) {
    case "need-wallet": return "Wallet needed";
    case "wrong-network": return "Switch network";
    case "request": return "Approve in wallet";
    case "pending": return "Submitted";
    case "confirming": return "Confirming";
    case "rejected": return "Cancelled";
    case "failed": return "Needs attention";
    case "success": return "Confirmed";
    default: return phase;
  }
}
