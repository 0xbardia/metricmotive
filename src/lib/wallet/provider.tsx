import type { ReactNode } from "react";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { getActiveDeployment } from "../contract.ts";
import { studioDevChain } from "./chain";
import { wagmiConfig } from "./config";
import { metricMotiveWalletTheme } from "./theme";

export function WalletProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
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
      </QueryClientProvider>
    </WagmiProvider>
  );
}
