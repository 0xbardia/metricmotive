import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveCreatedGuardId } from "../src/create-guard-resolution.ts";

const input = { motive: "Honor the customer", metric: "Close 10 deals", guardrails: [{ kind: "MUST" as const, text: "No duplicates" }] };

test("create resolution rejects concurrent identical definitions", () => {
  assert.throws(
    () => resolveCreatedGuardId([
      { id: "4", motive: input.motive, metric: input.metric, guardrails_json: JSON.stringify(input.guardrails) },
      { id: "5", motive: input.motive, metric: input.metric, guardrails_json: JSON.stringify(input.guardrails) },
    ], input),
    (err: unknown) => err instanceof Error && "code" in err && err.code === "AMBIGUOUS_CREATE",
  );
});

test("create resolution selects the unique exact definition", () => {
  assert.equal(
    resolveCreatedGuardId([
      { id: "4", motive: "Other", metric: input.metric, guardrails_json: JSON.stringify(input.guardrails) },
      { id: "5", motive: input.motive, metric: input.metric, guardrails_json: JSON.stringify(input.guardrails) },
    ], input),
    "5",
  );
});
