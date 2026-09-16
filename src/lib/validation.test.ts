import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "./errors.ts";
import { parseJsonText } from "./server/http-guard.ts";
import {
  parseInput,
  parseRunEvent,
  runCreateSchema,
} from "./validation.ts";

test("malformed JSON is a structured 400", () => {
  assert.throws(
    () => parseJsonText("{not-json"),
    (error: unknown) => error instanceof AppError && error.code === "INVALID_JSON" && error.status === 400,
  );
});

test("event data uses the canonical byte limit", () => {
  assert.throws(
    () => parseRunEvent({ type: "note", source: "test", data: { value: "x".repeat(2001) } }),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION",
  );
});

test("request validation rejects client-supplied ownership fields", () => {
  assert.throws(
    () => parseInput(runCreateSchema, { guardId: "grd_1", owner: "0x0000000000000000000000000000000000000001" }),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION",
  );
});
