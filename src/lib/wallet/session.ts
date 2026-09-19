import { useAccount, useChainId, useDisconnect, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ACTIVE_CHAIN_ID } from "./chain";

export function useWalletSession() {
  const { address, connector, isConnecting, isReconnecting, status } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { switchChain, switchChainAsync, isPending: switching } = useSwitchChain();
  const { openConnectModal } = useConnectModal();

  const onActiveChain = chainId === ACTIVE_CHAIN_ID;
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
    onStudionet: onActiveChain,
    onActiveChain,
    ready: connected && onActiveChain,
    connect: () => {
      openConnectModal?.();
    },
    disconnect: () => disconnect(),
    switchNetwork: async () => {
      await switchChainAsync({ chainId: ACTIVE_CHAIN_ID }).catch(() => {
        switchChain({ chainId: ACTIVE_CHAIN_ID });
      });
    },
  };
}

export function walletReady(): boolean {
  return false;
}
