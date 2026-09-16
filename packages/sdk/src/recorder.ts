import { MetricMotiveError, asError } from "./errors.ts";
import type { JsonBag, RunEvent, RunRecord } from "./types.ts";
import { createHash } from "node:crypto";

const MAX_EVENTS = 80;
const MAX_EVENT_DATA_BYTES = 2000;
const MAX_AGENT_REF = 200;

function validBag(value: unknown, label: string): JsonBag {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MetricMotiveError("VALIDATION", `${label} must be a JSON object`);
  }
  const bag = value as Record<string, unknown>;
  if (Object.keys(bag).length > 64 || Object.keys(bag).some((key) => key.length > 128)) {
    throw new MetricMotiveError("LIMIT", `${label} has too many fields`);
  }
  for (const item of Object.values(bag)) {
    if (item !== null && typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") {
      throw new MetricMotiveError("VALIDATION", `${label} values must be JSON primitives`);
    }
  }
  if (new TextEncoder().encode(JSON.stringify(bag)).byteLength > MAX_EVENT_DATA_BYTES) {
    throw new MetricMotiveError("LIMIT", `${label} exceeds ${MAX_EVENT_DATA_BYTES} bytes`);
  }
  return bag as JsonBag;
}

function validEvent(event: RunEvent): RunEvent {
  if (!event || typeof event.type !== "string" || !event.type.trim() || event.type.length > 64) {
    throw new MetricMotiveError("VALIDATION", "Event type is invalid");
  }
  if (!event.source?.trim() || event.source.length > 64) {
    throw new MetricMotiveError("VALIDATION", "Event source is invalid");
  }
  return {
    timestamp: event.timestamp || new Date().toISOString(),
    type: event.type,
    source: event.source,
    data: validBag(event.data, "Event data"),
    ...(event.artifactRef ? { artifactRef: event.artifactRef.slice(0, 512) } : {}),
  };
}

function nowId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export class MemoryRecorder {
  private runs = new Map<string, RunRecord>();

  startRun(input: { guardId: string; agentRef?: string; idempotencyKey?: string }): RunRecord {
    if (!input.guardId || input.guardId.length > 128) {
      throw new MetricMotiveError("VALIDATION", "Guard id is invalid");
    }
    if (input.agentRef && input.agentRef.length > MAX_AGENT_REF) {
      throw new MetricMotiveError("LIMIT", "Agent reference is too long");
    }
    const run: RunRecord = {
      id: nowId("run"),
      guardId: input.guardId,
      agentRef: input.agentRef ?? "sdk",
      status: "STARTED",
      events: [],
      outcome: {},
      startedAt: new Date().toISOString(),
      completedAt: null,
      authority: "local-memory",
    };
    this.runs.set(run.id, run);
    return { ...run, events: [...run.events] };
  }

  recordEvent(runId: string, event: RunEvent): RunRecord {
    const run = this.runs.get(runId);
    if (!run) throw new MetricMotiveError("NOT_FOUND", "Run not found");
    if (run.status !== "STARTED") {
      throw new MetricMotiveError("INVALID_STATE", "Cannot append to a finished run");
    }
    if (run.events.length >= MAX_EVENTS) {
      throw new MetricMotiveError("LIMIT", "Too many run events");
    }
    run.events.push(validEvent(event));
    return { ...run, events: [...run.events] };
  }

  completeRun(runId: string, outcome: JsonBag = {}): RunRecord {
    const run = this.runs.get(runId);
    if (!run) throw new MetricMotiveError("NOT_FOUND", "Run not found");
    if (run.status !== "STARTED") {
      throw new MetricMotiveError("INVALID_STATE", "Run already finished");
    }
    run.status = "FINISHED";
    run.outcome = validBag(outcome, "Run outcome");
    run.completedAt = new Date().toISOString();
    return { ...run, events: [...run.events] };
  }

  getRun(runId: string): RunRecord {
    const run = this.runs.get(runId);
    if (!run) throw new MetricMotiveError("NOT_FOUND", "Run not found");
    return { ...run, events: [...run.events] };
  }
}

export class HttpRecorder {
  private readonly apiUrl: string;
  private readonly webhookSecret: string | null;

  constructor(apiUrl: string, webhookSecret?: string) {
    this.apiUrl = apiUrl;
    this.webhookSecret = webhookSecret?.trim() || null;
  }


  private url(path: string): string {
    return `${this.apiUrl.replace(/\/$/, "")}${path}`;
  }

  private async headers(body: string, key: string): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "idempotency-key": key,
    };
    if (!this.webhookSecret) return headers;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const requestId = `sdk_${crypto.randomUUID().replace(/-/g, "")}`;
    const signingKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(this.webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      signingKey,
      new TextEncoder().encode(`${timestamp}.${requestId}.${body}`),
    );
    headers["x-metricmotive-timestamp"] = timestamp;
    headers["x-metricmotive-request-id"] = requestId;
    headers["x-metricmotive-signature"] = `sha256=${Buffer.from(signature).toString("hex")}`;
    return headers;
  }

  private key(seed: string): string {
    return `sdk_${createHash("sha256").update(seed).digest("hex").slice(0, 48)}`;
  }

  private async response(res: Response, operation: string): Promise<RunRecord> {
    const body: unknown = await res.json().catch(() => null);
    const run = body && typeof body === "object" ? (body as { run?: unknown }).run : null;
    if (!res.ok || !run || typeof run !== "object") {
      const error = body && typeof body === "object" ? (body as { error?: { message?: unknown } }).error : null;
      throw new MetricMotiveError(
        "API",
        typeof error?.message === "string" ? error.message : `${operation} failed (${res.status})`,
        "api",
      );
    }
    return { ...(run as RunRecord), authority: "http-api" };
  }

  async startRun(input: { guardId: string; agentRef?: string; idempotencyKey?: string }): Promise<RunRecord> {
    try {
      if (!input.guardId || input.guardId.length > 128) throw new MetricMotiveError("VALIDATION", "Guard id is invalid");
      if (input.agentRef && input.agentRef.length > MAX_AGENT_REF) throw new MetricMotiveError("LIMIT", "Agent reference is too long");
      const body = JSON.stringify({ guardId: input.guardId, agentRef: input.agentRef ?? "sdk" });
      const res = await fetch(this.url("/api/v1/runs"), {
        method: "POST",
        headers: await this.headers(body, input.idempotencyKey ?? this.key(`start:${input.guardId}:${input.agentRef ?? "sdk"}`)),
        body,
      });
      return await this.response(res, "startRun");
    } catch (err) {
      throw asError(err, "startRun failed");
    }
  }

  async recordEvent(runId: string, event: RunEvent): Promise<RunRecord> {
    try {
      const { idempotencyKey, ...wireEvent } = event;
      validEvent(wireEvent);
      const body = JSON.stringify(wireEvent);
      const res = await fetch(this.url(`/api/v1/runs/${runId}/events`), {
        method: "POST",
        headers: await this.headers(body, idempotencyKey ?? this.key(`event:${runId}:${body}`)),
        body,
      });
      return await this.response(res, "recordEvent");
    } catch (err) {
      throw asError(err, "recordEvent failed");
    }
  }

  async completeRun(runId: string, outcome: JsonBag = {}): Promise<RunRecord> {
    try {
      validBag(outcome, "Run outcome");
      const body = JSON.stringify({ outcome });
      const res = await fetch(this.url(`/api/v1/runs/${runId}/finish`), {
        method: "POST",
        headers: await this.headers(body, this.key(`finish:${runId}:${body}`)),
        body,
      });
      return await this.response(res, "completeRun");
    } catch (err) {
      throw asError(err, "completeRun failed");
    }
  }
}
