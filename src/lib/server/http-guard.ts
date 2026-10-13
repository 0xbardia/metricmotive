import { AppError } from "../errors.ts";

const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();
const TRUSTED_PROXY_HEADER = "x-metricmotive-proxy";

export function clientKey(request: Request): string {
  // nginx sets the private marker below. Without it, forwarded headers are
  // caller-controlled and must not become the rate-limit identity.
  if (request.headers.get(TRUSTED_PROXY_HEADER) === "nginx") {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    return forwarded || request.headers.get("x-real-ip") || "trusted-proxy";
  }
  return "direct-client";
}

export function rateLimit(key: string, limit = 60): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export async function readBodyLimited(request: Request, maxBytes = 32_768): Promise<string> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > maxBytes) {
    throw new AppError("PAYLOAD_TOO_LARGE", "Request body too large", 413);
  }
  return readStreamLimited(request.body, maxBytes);
}

export async function readStreamLimited(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The client may reset the connection as the oversized body is rejected.
        }
        throw new AppError("PAYLOAD_TOO_LARGE", "Request body too large", 413);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function readJsonLimited(
  request: Request,
  maxBytes = 32_768,
): Promise<unknown> {
  const text = await readBodyLimited(request, maxBytes);
  return parseJsonText(text);
}

export function parseJsonText(text: string): unknown {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("INVALID_JSON", "Request body must be JSON", 400);
  }
}
