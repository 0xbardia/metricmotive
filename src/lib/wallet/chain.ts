import type { Chain } from "@rainbow-me/rainbowkit";
import { GENLAYER } from "@/lib/domain";

export const studionetChain = {
  id: GENLAYER.chainId,
  name: "GenLayer Studionet",
  nativeCurrency: {
    name: GENLAYER.currency,
    symbol: GENLAYER.currency,
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [GENLAYER.rpcUrl] },
  },
  blockExplorers: {
    default: { name: "Studio Explorer", url: GENLAYER.explorerUrl },
  },
  iconUrl: "/favicon.svg",
  iconBackground: "#171816",
} as const satisfies Chain;

export const STUDIONET_CHAIN_HEX = `0x${GENLAYER.chainId.toString(16)}`;
