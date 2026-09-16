import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createGuardIdempotencyKey,
  createIntentDecision,
  type CreateIntentRecord,
  type CreateIntentIdentity,
} from "./create-intent.ts";

const identity: CreateIntentIdentity = {
  wallet: "0x61e26394c57c540C152f45f373f6C03a38674E2d",
  guardId: "grd_test",
  version: 1,
  definitionHash: "a".repeat(64),
  chainId: 61999,
  contractAddress: "0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8d7C",
};

function intent(state: CreateIntentRecord["state"] = "RESERVED"): CreateIntentRecord {
  return { ...identity, claimToken: "claim-a", state, txHash: null };
}

test("logical create key includes the local draft identity", () => {
  assert.equal(createGuardIdempotencyKey(identity), createGuardIdempotencyKey({ ...identity }));
  assert.notEqual(
    createGuardIdempotencyKey(identity),
    createGuardIdempotencyKey({ ...identity, definitionHash: "b".repeat(64) }),
  );
  assert.notEqual(
    createGuardIdempotencyKey(identity),
    createGuardIdempotencyKey({ ...identity, version: 2 }),
  );
});

test("the first reservation claims and a concurrent second request reuses it", async () => {
  let winner: CreateIntentRecord | null = null;
  let claims = 0;
  const reserve = async (claimToken: string) => {
    const decision = createIntentDecision(winner, identity);
    if (decision === "claim") {
      winner = { ...identity, claimToken, state: "RESERVED", txHash: null };
      claims += 1;
      return "claimed";
    }
    return "existing";
  };
  const results = await Promise.all([reserve("claim-a"), reserve("claim-b")]);
  assert.deepEqual(results, ["claimed", "existing"]);
  assert.equal(claims, 1);
});

test("a released reservation can be claimed again, but a submitted one cannot", () => {
  assert.equal(createIntentDecision(intent("RELEASED"), identity), "claim");
  assert.equal(createIntentDecision(intent("SUBMITTED"), identity), "existing");
  assert.equal(
    createIntentDecision({ ...intent(), wallet: "0x0000000000000000000000000000000000000001" }, identity),
    "conflict",
  );
});
