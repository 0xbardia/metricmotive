import type { Chain } from "@rainbow-me/rainbowkit";
import { studioDevnet } from "genlayer-js/chains";
import { getActiveDeployment } from "../contract.ts";

const active = getActiveDeployment();

if (studioDevnet.id !== active.chainId) {
  throw new Error("studioDevnet does not match the active MetricMotive deployment");
}

export const studioDevChain = {
  id: studioDevnet.id,
  name: active.networkName,
  nativeCurrency: {
    name: "GEN",
    symbol: "GEN",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [active.rpcUrl] },
  },
  blockExplorers: {
    default: { name: "Studio Dev Explorer", url: active.explorerUrl },
  },
  iconUrl: "/favicon.svg",
  iconBackground: "#171816",
} as const satisfies Chain;

export const ACTIVE_CHAIN_HEX = `0x${studioDevChain.id.toString(16)}`;
export const ACTIVE_CHAIN_ID = studioDevChain.id;
