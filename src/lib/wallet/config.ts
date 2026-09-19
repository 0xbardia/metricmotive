import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { getActiveDeployment } from "../contract.ts";
import { studioDevChain } from "./chain";

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
      groupName: getActiveDeployment().networkName,
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
  chains: [studioDevChain],
  transports: {
    [studioDevChain.id]: http(getActiveDeployment().rpcUrl),
  },
  ssr: true,
  multiInjectedProviderDiscovery: true,
});
