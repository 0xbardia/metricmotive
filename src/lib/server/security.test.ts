import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clientKey,
} from "./http-guard.ts";
import { readBodyLimited, readStreamLimited } from "./http-guard.ts";
import {
  constantTimeHexEqual,
  hmacHex,
  isMonotonicStatus,
  normalizeWalletAddress,
  statusRank,
} from "./security.ts";

test("chain status ordering is monotonic", () => {
  assert.equal(statusRank("RESOLVED"), 3);
  assert.equal(isMonotonicStatus("RESOLVED", "ARMED"), false);
  assert.equal(isMonotonicStatus("ARMED", "RESOLVED"), true);
});

test("untrusted forwarded headers cannot choose a new rate-limit identity", () => {
  const first = clientKey(new Request("https://metricmotive.test", {
    headers: { "x-forwarded-for": "198.51.100.1" },
  }));
  const second = clientKey(new Request("https://metricmotive.test", {
    headers: { "x-forwarded-for": "203.0.113.9" },
  }));
  assert.equal(first, "direct-client");
  assert.equal(first, second);
  assert.equal(
    clientKey(new Request("https://metricmotive.test", {
      headers: { "x-metricmotive-proxy": "nginx", "x-forwarded-for": "198.51.100.1" },
    })),
    "198.51.100.1",
  );
});

test("wallet and webhook primitives reject malformed identity and compare HMACs safely", () => {
  assert.equal(normalizeWalletAddress("0x0000000000000000000000000000000000000001"), "0x0000000000000000000000000000000000000001");
  assert.throws(() => normalizeWalletAddress("owner"), /valid wallet address/i);
  const signature = hmacHex("secret", "body");
  assert.equal(constantTimeHexEqual(signature, hmacHex("secret", "body")), true);
  assert.equal(constantTimeHexEqual(signature, hmacHex("wrong", "body")), false);
});

test("chunked request bodies are bounded before buffering", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("x".repeat(33)));
      controller.close();
    },
  });
  const request = new Request("https://metricmotive.test", {
    method: "POST",
    body,
    duplex: "half",
  } as unknown as RequestInit);
  await assert.rejects(
    () => readBodyLimited(request, 32),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "PAYLOAD_TOO_LARGE",
  );
});

test("body-limit cancellation failures still return a structured size error", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("x".repeat(33)));
    },
    cancel() {
      return Promise.reject(new Error("client reset"));
    },
  });
  await assert.rejects(
    () => readStreamLimited(stream, 32),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "PAYLOAD_TOO_LARGE",
  );
});

test("external response bodies are bounded before advisory parsing", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("x".repeat(65)));
      controller.close();
    },
  });
  await assert.rejects(
    () => readStreamLimited(stream, 64),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "PAYLOAD_TOO_LARGE",
  );
});
