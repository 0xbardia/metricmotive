import { CURRENT_CONTRACT } from "../packages/sdk/src/deployment.ts";

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
console.log(`Deployment configuration verified: ${CURRENT_CONTRACT.contractAddress} / ${CURRENT_CONTRACT.chainId}`);
