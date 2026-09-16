import assert from "node:assert/strict";
import test from "node:test";
import { MetricMotiveClient } from "../src/client.ts";
import { CURRENT_CONTRACT, LEGACY_CONTRACT_ADDRESS } from "../src/deployment.ts";

test("SDK defaults to the active deployment and preserves explicit historical configuration", () => {
  assert.equal(new MetricMotiveClient({}).contractAddress, CURRENT_CONTRACT.contractAddress);
  assert.equal(new MetricMotiveClient({ contractAddress: LEGACY_CONTRACT_ADDRESS }).contractAddress, LEGACY_CONTRACT_ADDRESS);
});
