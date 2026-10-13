import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { CURRENT_CONTRACT, LEGACY_CONTRACT_ADDRESS } from "../packages/sdk/src/deployment.ts";

// HISTORICAL: this script targets the previous Studionet deployment (chain 61999), not the
// active registry (packages/sdk/src/deployment.ts, chain 61997). Refuses to run without opt-in.
if (process.env.METRICMOTIVE_ALLOW_HISTORICAL !== "YES") {
  console.error("Refusing to run: audit-contract-readonly.mjs targets the historical Studionet deployment (61999). The active deployment is defined in packages/sdk/src/deployment.ts. Set METRICMOTIVE_ALLOW_HISTORICAL=YES to run it anyway.");
  process.exit(1);
}

const client = createClient({ chain: studionet });
assert.equal(studionet.id, CURRENT_CONTRACT.chainId);
const results = [];
for (const address of [CURRENT_CONTRACT.contractAddress, LEGACY_CONTRACT_ADDRESS]) {
  const code = await client.getContractCode(address);
  assert.ok(code.length > 0);
  const schema = await client.getContractSchema(address);
  const reads = {};
  for (const [functionName, method] of Object.entries(schema.methods)) {
    if (!method.readonly) continue;
    reads[functionName] = await client.readContract({ address, functionName, args: functionName === "get_guards_by_owner" ? ["0x0000000000000000000000000000000000000001"] : method.params.length ? [0] : [] });
  }
  results.push({ address, sourceBytes: Buffer.byteLength(code), sourceSha256: createHash("sha256").update(code).digest("hex"), schema, reads });
}
assert.equal(results[0].sourceSha256, results[1].sourceSha256);
assert.deepEqual(results[0].schema, results[1].schema);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), chainId: CURRENT_CONTRACT.chainId, writesSubmitted: 0, identicalSource: true, identicalInterface: true, results }, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
