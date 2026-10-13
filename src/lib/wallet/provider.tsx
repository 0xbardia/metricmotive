import "@rainbow-me/rainbowkit/styles.css";
import type { ReactNode } from "react";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { getActiveDeployment } from "../contract.ts";
import { studioDevChain } from "./chain";
import { wagmiConfig } from "./config";
import { metricMotiveWalletTheme } from "./theme";

// The shared QueryClient (src/lib/query-client.ts) comes from the root QueryClientProvider.
export function WalletProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <RainbowKitProvider
        theme={metricMotiveWalletTheme}
        initialChain={studioDevChain}
        appInfo={{
          appName: "MetricMotive",
          learnMoreUrl: getActiveDeployment().studioUrl,
        }}
      >
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
