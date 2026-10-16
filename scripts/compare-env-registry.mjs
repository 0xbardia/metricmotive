#!/usr/bin/env node
// Compares the GENLAYER_* variables in the CURRENT environment with the deployment registry
// (packages/sdk/src/deployment.ts, active row). Prints only the variable NAME and match / mismatch / unset,
// never a value. Exit 1 on any mismatch.
//   (set -a; . $APP_DIR/.env; set +a; node scripts/compare-env-registry.mjs)
import { getActiveDeployment } from "../packages/sdk/src/deployment.ts";

const a = getActiveDeployment();
const expected = {
  GENLAYER_CONTRACT_ADDRESS: a.contractAddress,
  GENLAYER_CHAIN_ID: String(a.chainId),
  GENLAYER_NETWORK: a.networkName,
  GENLAYER_RPC_URL: a.rpcUrl,
};
let bad = 0;
for (const [name, want] of Object.entries(expected)) {
  const got = process.env[name]?.trim();
  const state = !got ? "unset (the registry value is used)" : got.toLowerCase() === want.toLowerCase() ? "match" : "MISMATCH";
  if (state === "MISMATCH") bad++;
  console.log(`${name}: ${state}`);
}
console.log(`registry active deployment: ${a.key}`);
process.exit(bad ? 1 : 0);
