import { AppError } from "@/lib/errors";
import { normalizeWalletAddress, constantTimeHexEqual, hmacHex } from "./security";
import { getWalletSession } from "./wallet-auth.server";

const MAX_SKEW_SECONDS = 300;

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export type MutationIdentity = { address: string; mode: "wallet" | "webhook" };

export async function authenticateMutation(
  request: Request,
  body?: string,
): Promise<MutationIdentity> {
  const session = await getWalletSession(request);
  if (session) return { address: session.address, mode: "wallet" };
  if (body === undefined) {
    throw new AppError("UNAUTHENTICATED", "Wallet authentication required", 401);
  }

  const secret = env("METRICMOTIVE_WEBHOOK_SECRET");
  const owner = env("METRICMOTIVE_WEBHOOK_OWNER");
  const timestamp = request.headers.get("x-metricmotive-timestamp")?.trim();
  const requestId = request.headers.get("x-metricmotive-request-id")?.trim();
  const provided = request.headers
    .get("x-metricmotive-signature")
    ?.trim()
    .replace(/^sha256=/i, "");
  if (!secret || !owner || !timestamp || !requestId || !provided) {
    throw new AppError("UNAUTHENTICATED", "Wallet or signed webhook authentication required", 401);
  }
  if (!/^\d{10,13}$/.test(timestamp) || requestId.length > 128 || !/^[0-9a-f]{64}$/i.test(provided)) {
    throw new AppError("INVALID_WEBHOOK", "Webhook authentication is invalid", 401);
  }
  const timestampMs = Number(timestamp.length === 10 ? `${timestamp}000` : timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_SKEW_SECONDS * 1000) {
    throw new AppError("STALE_WEBHOOK", "Webhook timestamp is outside the replay window", 401);
  }
  const expected = hmacHex(secret, `${timestamp}.${requestId}.${body}`);
  if (!constantTimeHexEqual(expected, provided)) {
    throw new AppError("INVALID_WEBHOOK", "Webhook authentication is invalid", 401);
  }
  return { address: normalizeWalletAddress(owner), mode: "webhook" };
}
