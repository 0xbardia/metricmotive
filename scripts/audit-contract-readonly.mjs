import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { CURRENT_CONTRACT, LEGACY_CONTRACT_ADDRESS } from "../packages/sdk/src/deployment.ts";

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
