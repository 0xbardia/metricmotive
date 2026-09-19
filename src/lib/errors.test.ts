import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { errorBody } from "./errors.ts";

describe("user-facing error hygiene", () => {
  it("does not expose raw SQL schema errors", () => {
    const body = errorBody(new Error('column "contract_address" of relation "guards" does not exist'), "req_test");
    assert.equal(body.error.code, "SCHEMA_NOT_READY");
    assert.equal(body.error.message, "MetricMotive couldn’t save this draft. Please retry.");
    assert.doesNotMatch(body.error.message, /contract_address|guards/i);
  });

  it("maps unknown errors to a generic internal response", () => {
    const body = errorBody(new Error("private driver detail"), "req_test");
    assert.equal(body.error.code, "INTERNAL");
    assert.equal(body.error.message, "Unexpected error");
  });
});
