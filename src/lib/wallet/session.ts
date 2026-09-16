import { useAccount, useChainId, useDisconnect, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { GENLAYER } from "@/lib/domain";

export function useWalletSession() {
  const { address, connector, isConnecting, isReconnecting, status } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { switchChain, switchChainAsync, isPending: switching } = useSwitchChain();
  const { openConnectModal } = useConnectModal();

  const onStudionet = chainId === GENLAYER.chainId;
  const connected = Boolean(address);

  return {
    address: address ?? null,
    chainId: chainId || null,
    connector: connector ?? null,
    connecting: isConnecting || isReconnecting,
    switching,
    status,
    error: null as string | null,
    connected,
    onStudionet,
    ready: connected && onStudionet,
    connect: () => {
      openConnectModal?.();
    },
    disconnect: () => disconnect(),
    switchNetwork: async () => {
      await switchChainAsync({ chainId: GENLAYER.chainId }).catch(() => {
        switchChain({ chainId: GENLAYER.chainId });
      });
    },
  };
}

export function walletReady(): boolean {
  return false;
}
