import { createClient } from "genlayer-js";
import type { MetricMotiveDeployment } from "../../../packages/sdk/src/deployment.ts";
import {
  deploymentForContractAddress,
  deploymentForProvenance,
  genLayerChainForDeployment,
} from "../../../packages/sdk/src/chain-preset.ts";

export type DeploymentClient = {
  deployment: MetricMotiveDeployment;
  chain: ReturnType<typeof genLayerChainForDeployment>;
  client: ReturnType<typeof createClient>;
};

export function getReadClientForDeployment(deployment: MetricMotiveDeployment): DeploymentClient {
  const chain = genLayerChainForDeployment(deployment);
  return {
    deployment,
    chain,
    client: createClient({ chain }),
  };
}

export function getReadClientForProvenance(input: {
  chainId: number;
  contractAddress: string;
}): DeploymentClient {
  return getReadClientForDeployment(deploymentForProvenance(input.chainId, input.contractAddress));
}

export function getReadClientForContract(contractAddress: string): DeploymentClient {
  return getReadClientForDeployment(deploymentForContractAddress(contractAddress));
}

export function transactionIdentity(input: {
  chainId: number;
  contractAddress: string;
  txHash: string;
}) {
  return `${input.chainId}:${input.contractAddress.toLowerCase()}:${input.txHash.toLowerCase()}`;
}
