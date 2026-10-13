import {
  CURRENT_CONTRACT,
  DEPLOYMENTS,
  getActiveDeployment,
} from "../packages/sdk/src/deployment.ts";

const envAddress = process.env.GENLAYER_CONTRACT_ADDRESS?.trim();
const envChain = process.env.GENLAYER_CHAIN_ID?.trim();
const envNetwork = process.env.GENLAYER_NETWORK?.trim();
const envRpc = process.env.GENLAYER_RPC_URL?.trim();

if (envAddress && envChain) {
  // Only the active row may pass. Historical and legacy rows are registered but must never be started against.
  const active = getActiveDeployment();
  if (Number(envChain) !== active.chainId || envAddress.toLowerCase() !== active.contractAddress.toLowerCase()) {
    throw new Error(
      `GENLAYER_CONTRACT_ADDRESS and GENLAYER_CHAIN_ID are not the active deployment (${active.key}: chain ${active.chainId}, ${active.contractAddress}). Historical and legacy deployments are refused; set .env to the active values.`,
    );
  }
  if (envNetwork && envNetwork !== active.networkName) {
    throw new Error("GENLAYER_NETWORK disagrees with the deployment registry.");
  }
  if (envRpc && envRpc !== active.rpcUrl) {
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
