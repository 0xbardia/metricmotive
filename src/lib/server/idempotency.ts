import { createHash } from "node:crypto";
import { getSql } from "@/lib/db";
import { AppError } from "@/lib/errors";

const PENDING = "__metricmotive_pending__";
const TTL_MS = 24 * 60 * 60_000;

export function requestFingerprint(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function requireIdempotencyKey(request: Request, fallback?: string): string {
  const value = request.headers.get("idempotency-key")?.trim() || fallback?.trim();
  if (!value || value.length > 128) {
    throw new AppError("IDEMPOTENCY_REQUIRED", "Idempotency-Key is required", 400);
  }
  return value;
}

export async function idempotent<T>(
  scope: string,
  key: string,
  fingerprint: string,
  work: () => Promise<T>,
): Promise<T> {
  const sql = await getSql();
  const storageKey = `${scope}:${key}`;
  await sql.query("delete from idempotency_keys where expires_at <= now()");
  const inserted = await sql.query<{ response_json: string }>(
    `insert into idempotency_keys (key, scope, fingerprint, response_json, expires_at)
     values ($1,$2,$3,$4,$5)
     on conflict (key) do nothing
     returning response_json`,
    [storageKey, scope, fingerprint, PENDING, new Date(Date.now() + TTL_MS).toISOString()],
  );
  if (!inserted[0]) {
    const existing = await sql.query<{ fingerprint: string; response_json: string }>(
      `select fingerprint, response_json from idempotency_keys where key=$1 limit 1`,
      [storageKey],
    );
    if (!existing[0]) throw new AppError("IDEMPOTENCY_RETRY", "Retry the request", 409);
    if (existing[0].fingerprint !== fingerprint) {
      throw new AppError("IDEMPOTENCY_CONFLICT", "Idempotency key was reused for a different request", 409);
    }
    if (existing[0].response_json === PENDING) {
      throw new AppError("IDEMPOTENCY_IN_PROGRESS", "The original request is still processing", 409);
    }
    try {
      return JSON.parse(existing[0].response_json) as T;
    } catch {
      throw new AppError("DATA_CORRUPT", "Stored idempotent response is invalid", 500);
    }
  }

  try {
    const result = await work();
    await sql.query(
      `update idempotency_keys set response_json=$1 where key=$2 and response_json=$3`,
      [JSON.stringify(result), storageKey, PENDING],
    );
    return result;
  } catch (err) {
    await sql.query("delete from idempotency_keys where key=$1 and response_json=$2", [storageKey, PENDING]);
    throw err;
  }
}
