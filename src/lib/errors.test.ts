import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError, errorBody } from "./errors.ts";

describe("user-facing error hygiene", () => {
  it("does not expose raw SQL schema errors", () => {
    const body = errorBody(new Error('column "contract_address" of relation "guards" does not exist'), "req_test", () => {});
    assert.equal(body.error.code, "SCHEMA_NOT_READY");
    assert.equal(body.error.message, "MetricMotive couldn’t save this draft. Please retry.");
    assert.doesNotMatch(body.error.message, /contract_address|guards/i);
  });

  it("maps unknown errors to a generic internal response", () => {
    const body = errorBody(new Error("private driver detail"), "req_test", () => {});
    assert.equal(body.error.code, "INTERNAL");
    assert.equal(body.error.message, "Something went wrong. Try again.");
  });

  it("passes AppError through", () => {
    const body = errorBody(new AppError("NOPE", "Not allowed", 403), "req_test", () => {});
    assert.deepEqual(body.error, { code: "NOPE", message: "Not allowed" });
  });

  it("never leaks a driver-style error object and logs the original", () => {
    const pg = { code: "23505", message: 'duplicate key value violates unique constraint "x"' };
    const calls: unknown[][] = [];
    const body = errorBody(pg, "req_test", (...a) => calls.push(a));
    assert.equal(body.error.code, "INTERNAL");
    assert.doesNotMatch(JSON.stringify(body), /duplicate key|23505/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1], pg);
  });
});
