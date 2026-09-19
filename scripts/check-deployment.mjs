import {
  CURRENT_CONTRACT,
  DEPLOYMENTS,
  getDeploymentByChainAndContract,
} from "../packages/sdk/src/deployment.ts";

const envAddress = process.env.GENLAYER_CONTRACT_ADDRESS?.trim();
const envChain = process.env.GENLAYER_CHAIN_ID?.trim();
const envNetwork = process.env.GENLAYER_NETWORK?.trim();
const envRpc = process.env.GENLAYER_RPC_URL?.trim();

if (envAddress && envChain) {
  const row = getDeploymentByChainAndContract(Number(envChain), envAddress);
  if (envNetwork && envNetwork !== row.networkName && envNetwork !== CURRENT_CONTRACT.network) {
    throw new Error("GENLAYER_NETWORK disagrees with the deployment registry.");
  }
  if (envRpc && envRpc !== row.rpcUrl) {
    throw new Error("GENLAYER_RPC_URL disagrees with the deployment registry.");
  }
} else {
  for (const [key, expected] of Object.entries({
    GENLAYER_CONTRACT_ADDRESS: CURRENT_CONTRACT.contractAddress,
    GENLAYER_CHAIN_ID: String(CURRENT_CONTRACT.chainId),
    GENLAYER_NETWORK: CURRENT_CONTRACT.network,
    GENLAYER_RPC_URL: CURRENT_CONTRACT.rpcUrl,
  })) {
    const value = process.env[key]?.trim();
    if (value && value.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(`${key} disagrees with the tested deployment. Rebuild after a provenance-aware migration.`);
    }
  }
}

void DEPLOYMENTS;
console.log(`Deployment configuration verified: ${CURRENT_CONTRACT.contractAddress} / ${CURRENT_CONTRACT.chainId}`);
