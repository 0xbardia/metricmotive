import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { GENLAYER } from "@/lib/domain";

/** `compact` is the phone header: the network name collapses below `sm`; the menu keeps it. */
export function WalletControl({ compact = false }: { compact?: boolean }) {
  const networkClass = compact
    ? "hidden min-h-11 font-mono text-xs text-graphite sm:block"
    : "min-h-11 font-mono text-xs text-graphite";
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        if (!ready) {
          return (
            <Button size="sm" variant="outline" className="min-h-11" disabled>
              Connect wallet
            </Button>
          );
        }
        if (!connected) {
          return (
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={openConnectModal}
              data-wallet="connect"
            >
              <span className="sm:hidden">Connect</span>
              <span className="hidden sm:inline">Connect wallet</span>
            </Button>
          );
        }
        const wrong = chain.unsupported || chain.id !== GENLAYER.chainId;
        if (wrong) {
          return (
            <Button
              size="sm"
              variant="ochre"
              className="min-h-11"
              onClick={openChainModal}
              data-wallet="wrong-network"
            >
              <span className="sm:hidden">Switch network</span>
              <span className="hidden sm:inline">Switch to GenLayer Studio Dev</span>
            </Button>
          );
        }
        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openChainModal}
              className={networkClass}
              data-wallet="network"
            >
              {chain.name}
            </button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 max-w-32 truncate sm:max-w-none"
              onClick={openAccountModal}
              data-wallet="account"
            >
              {account.displayName}
            </Button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
