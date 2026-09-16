import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { GENLAYER } from "@/lib/domain";

export function WalletControl() {
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
            <Button size="sm" variant="outline" disabled>
              Connect wallet
            </Button>
          );
        }
        if (!connected) {
          return (
            <Button
              size="sm"
              variant="outline"
              onClick={openConnectModal}
              data-wallet="connect"
            >
              Connect wallet
            </Button>
          );
        }
        const wrong = chain.unsupported || chain.id !== GENLAYER.chainId;
        if (wrong) {
          return (
            <Button
              size="sm"
              variant="ochre"
              onClick={openChainModal}
              data-wallet="wrong-network"
            >
              Switch to Studionet
            </Button>
          );
        }
        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openChainModal}
              className="hidden font-mono text-xs text-graphite sm:inline"
              data-wallet="network"
            >
              {chain.name}
            </button>
            <Button
              size="sm"
              variant="outline"
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
