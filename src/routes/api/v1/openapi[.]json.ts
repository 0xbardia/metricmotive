import { createFileRoute } from "@tanstack/react-router";

const jsonBag = {
  type: "object",
  additionalProperties: {
    oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" }],
  },
  maxProperties: 64,
  description: "Flat JSON object. UTF-8 encoded data is limited to 2,000 bytes.",
};

const errorResponse = {
  description: "Structured error",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
};

const spec = {
  openapi: "3.0.3",
  info: {
    title: "MetricMotive API",
    version: "1.0.3",
    description: "Authenticated Run Recorder and Guard indexing. GenLayer remains authoritative for finalized verdicts. Mutation bodies are capped at 32 KiB.",
  },
  servers: [{ url: "https://metricmotive.bydx.fun" }],
  paths: {
    "/api/v1/health": {
      get: { summary: "Liveness", responses: { "200": { description: "ok" } } },
    },
    "/api/v1/ready": {
      get: { summary: "Readiness", responses: { "200": { description: "ready" }, "503": errorResponse } },
    },
    "/api/v1/contract": {
      get: { summary: "Certified Studionet deployment", responses: { "200": { description: "deployment" } } },
    },
    "/api/v1/auth/nonce": {
      post: {
        summary: "Issue a wallet sign-in challenge",
        description: "The challenge expires after five minutes and is single-use. The signature authorizes off-chain data access; it is not a blockchain transaction.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["address"], properties: { address: { type: "string" } }, additionalProperties: false } } } },
        responses: { "200": { description: "challenge" }, "400": errorResponse, "429": errorResponse },
      },
    },
    "/api/v1/auth/verify": {
      post: {
        summary: "Verify a wallet challenge",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["address", "nonce", "signature"], properties: { address: { type: "string" }, nonce: { type: "string" }, signature: { type: "string" } }, additionalProperties: false } } } },
        responses: { "200": { description: "session cookie is set" }, "400": errorResponse, "401": errorResponse },
      },
    },
    "/api/v1/auth/session": {
      get: { summary: "Read the current wallet session", description: "Returns address:null when no valid session cookie is present.", responses: { "200": { description: "session or no active session" } } },
      delete: { summary: "Revoke the current wallet session", responses: { "200": { description: "session revoked or already absent" } } },
    },
    "/api/v1/runs": {
      get: {
        summary: "List runs owned by the authenticated wallet",
        security: [{ walletSession: [] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
        ],
        responses: { "200": { description: "bounded run page" }, "401": errorResponse, "429": errorResponse },
      },
      post: {
        summary: "Start a run",
        description: "The Guard must be ARMED. Authenticate with the wallet session or signed webhook headers. Use Idempotency-Key for retries; an identical retry returns the original run.",
        security: [{ walletSession: [] }, { webhookHmac: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RunCreate" } } } },
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        responses: { "200": { description: "run" }, "400": errorResponse, "401": errorResponse, "403": errorResponse, "409": errorResponse, "413": errorResponse },
      },
    },
    "/api/v1/runs/{id}/events": {
      post: {
        summary: "Append an event",
        description: "The event is appended atomically and the Run must belong to the authenticated wallet or webhook owner. A Run accepts at most 80 events.",
        security: [{ walletSession: [] }, { webhookHmac: [] }],
        parameters: [{ $ref: "#/components/parameters/RunId" }, { $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/EventRequest" } } } },
        responses: { "200": { description: "run" }, "400": errorResponse, "401": errorResponse, "403": errorResponse, "409": errorResponse, "413": errorResponse },
      },
    },
    "/api/v1/runs/{id}/finish": {
      post: {
        summary: "Finish a run",
        security: [{ walletSession: [] }, { webhookHmac: [] }],
        parameters: [{ $ref: "#/components/parameters/RunId" }, { $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/FinishRequest" } } } },
        responses: { "200": { description: "run" }, "400": errorResponse, "401": errorResponse, "403": errorResponse, "409": errorResponse, "413": errorResponse },
      },
    },
    "/api/v1/hooks/events": {
      post: {
        summary: "Append an authenticated webhook event",
        description: "Requires the server-side webhook secret and owner. Sign `<unix-seconds>.<request-id>.<raw-body>` with HMAC-SHA256 and send the timestamp, request ID, and hex signature headers. The timestamp replay window is five minutes.",
        security: [{ webhookHmac: [] }, { walletSession: [] }],
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/HookEvent" } } } },
        responses: { "200": { description: "run" }, "400": errorResponse, "401": errorResponse, "403": errorResponse, "409": errorResponse, "413": errorResponse },
      },
    },
  },
  components: {
    securitySchemes: {
      walletSession: { type: "apiKey", in: "cookie", name: "__Host-metricmotive_session", description: "HttpOnly cookie returned after wallet nonce verification." },
      webhookHmac: { type: "apiKey", in: "header", name: "x-metricmotive-signature", description: "Also requires x-metricmotive-timestamp and x-metricmotive-request-id." },
    },
    parameters: {
      IdempotencyKey: { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", maxLength: 128 }, description: "Retries with the same key and body return the original result. Stored for 24 hours." },
      RunId: { name: "id", in: "path", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
    },
    schemas: {
      JsonBag: jsonBag,
      RunCreate: { type: "object", required: ["guardId"], additionalProperties: false, properties: { guardId: { type: "string", maxLength: 128 }, agentRef: { type: "string", maxLength: 200 } } },
      EventRequest: { type: "object", additionalProperties: false, properties: { timestamp: { type: "string", format: "date-time" }, type: { type: "string", maxLength: 64 }, source: { type: "string", maxLength: 64 }, data: { $ref: "#/components/schemas/JsonBag" }, artifactRef: { type: "string", maxLength: 512 } } },
      HookEvent: { type: "object", required: ["runId"], additionalProperties: false, properties: { runId: { type: "string", minLength: 1, maxLength: 128 }, timestamp: { type: "string", format: "date-time" }, type: { type: "string", minLength: 1, maxLength: 64 }, source: { type: "string", minLength: 1, maxLength: 64 }, data: { $ref: "#/components/schemas/JsonBag" }, artifactRef: { type: "string", maxLength: 512 } } },
      FinishRequest: { type: "object", additionalProperties: false, properties: { outcome: { $ref: "#/components/schemas/JsonBag" } } },
      Error: { type: "object", required: ["error", "requestId"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } }, requestId: { type: "string" } } },
    },
  },
};

export const Route = createFileRoute("/api/v1/openapi.json")({
  server: {
    handlers: {
      GET: async () => Response.json(spec),
    },
  },
});
