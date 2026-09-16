import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { GENLAYER } from "@/lib/domain";
import { studionetChain } from "./chain";

function readWalletConnectProjectId(): string {
  const fromEnv =
    typeof import.meta !== "undefined"
      ? String(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "").trim()
      : "";
  return fromEnv;
}

export const walletConnectProjectId = readWalletConnectProjectId();
const walletFactories = walletConnectProjectId
  ? [injectedWallet, metaMaskWallet, rainbowWallet, walletConnectWallet]
  : [injectedWallet];

const connectors = connectorsForWallets(
  [
    {
      groupName: "Studionet",
      wallets: walletFactories,
    },
  ],
  {
    appName: "MetricMotive",
    projectId: walletConnectProjectId,
  },
);

export const wagmiConfig = createConfig({
  connectors,
  chains: [studionetChain],
  transports: {
    [studionetChain.id]: http(GENLAYER.rpcUrl),
  },
  ssr: true,
  multiInjectedProviderDiscovery: true,
});
