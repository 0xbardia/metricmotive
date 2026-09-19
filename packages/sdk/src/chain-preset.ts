import { studioDevnet, studionet } from "genlayer-js/chains";
import type { MetricMotiveDeployment } from "./deployment.ts";
import { getDeploymentByChainAndContract, findDeploymentsByContract } from "./deployment.ts";

export function genLayerChainForDeployment(deployment: MetricMotiveDeployment) {
  if (deployment.chainId === studioDevnet.id) return studioDevnet;
  if (deployment.chainId === studionet.id) return studionet;
  throw new Error("Unsupported Guard deployment");
}

export function deploymentForProvenance(chainId: number, contractAddress: string): MetricMotiveDeployment {
  return getDeploymentByChainAndContract(chainId, contractAddress);
}

export function deploymentForContractAddress(contractAddress: string): MetricMotiveDeployment {
  const matches = findDeploymentsByContract(contractAddress);
  if (matches.length !== 1) throw new Error("Unsupported Guard deployment");
  return matches[0];
}
