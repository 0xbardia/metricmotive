import { getRequest } from "@tanstack/react-start/server";
import { verifyMessage, type Address, type Hex } from "viem";
import { createHash, randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { normalizeWalletAddress } from "./security";

export const WALLET_SESSION_COOKIE = "__Host-metricmotive_session";
const CHALLENGE_TTL_MS = 5 * 60_000;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function appOrigin(): URL {
  const configured = process.env.VITE_APP_URL?.trim() || "http://localhost:8080";
  try {
    return new URL(configured);
  } catch {
    return new URL("http://localhost:8080");
  }
}

function challengeMessage(address: string, nonce: string, issuedAt: string, expiresAt: string): string {
  return [
    "MetricMotive wallet sign-in",
    `Domain: ${appOrigin().host}`,
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued: ${issuedAt}`,
    `Expires: ${expiresAt}`,
    "This signature authorizes MetricMotive to manage this wallet's off-chain Guard data.",
    "It does not authorize a blockchain transaction.",
  ].join("\n");
}

export async function issueWalletChallenge(rawAddress: unknown) {
  const address = normalizeWalletAddress(rawAddress);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
  const nonce = randomBytes(32).toString("hex");
  const message = challengeMessage(
    address,
    nonce,
    issuedAt.toISOString(),
    expiresAt.toISOString(),
  );
  const sql = await getSql();
  await sql.query("delete from wallet_nonces where expires_at <= now()");
  await sql.query(
    `insert into wallet_nonces (nonce_hash, address, message, expires_at)
     values ($1, $2, $3, $4)`,
    [hash(nonce), address, message, expiresAt.toISOString()],
  );
  return { address, nonce, message, expiresAt: expiresAt.toISOString() };
}

export async function verifyWalletChallenge(input: {
  address: unknown;
  nonce: unknown;
  signature: unknown;
}) {
  const address = normalizeWalletAddress(input.address);
  if (typeof input.nonce !== "string" || !/^[a-f0-9]{64}$/.test(input.nonce)) {
    throw new AppError("INVALID_NONCE", "Wallet challenge is invalid or expired", 401);
  }
  if (typeof input.signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(input.signature)) {
    throw new AppError("INVALID_SIGNATURE", "Wallet signature is invalid", 401);
  }
  const sql = await getSql();
  const rows = await sql.query<{
    nonce_hash: string;
    address: string;
    message: string;
  }>(
    `select nonce_hash, address, message from wallet_nonces
     where nonce_hash=$1 and lower(address)=lower($2) and used_at is null and expires_at > now()
     limit 1`,
    [hash(input.nonce), address],
  );
  const challenge = rows[0];
  if (!challenge) {
    throw new AppError("NONCE_EXPIRED", "Wallet challenge is invalid or expired", 401);
  }
  let valid = false;
  try {
    valid = await verifyMessage({
      address: address as Address,
      message: challenge.message,
      signature: input.signature as Hex,
    });
  } catch {
    valid = false;
  }
  if (!valid) throw new AppError("INVALID_SIGNATURE", "Wallet signature is invalid", 401);

  const consumed = await sql.query(
    `update wallet_nonces set used_at=now()
     where nonce_hash=$1 and used_at is null and expires_at > now()
     returning nonce_hash`,
    [challenge.nonce_hash],
  );
  if (!consumed[0]) {
    throw new AppError("NONCE_REPLAY", "Wallet challenge has already been used", 401);
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await sql.query(
    `insert into wallet_sessions (token_hash, address, expires_at)
     values ($1, $2, $3)`,
    [hash(token), address, expiresAt.toISOString()],
  );
  return { address, token, expiresAt: expiresAt.toISOString() };
}

function cookieValue(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)__Host-metricmotive_session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function getWalletSession(request = getRequest()) {
  if (!request) return null;
  const token = cookieValue(request);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const sql = await getSql();
  const rows = await sql.query<{ address: string }>(
    `select address from wallet_sessions where token_hash=$1 and expires_at > now() limit 1`,
    [hash(token)],
  );
  if (!rows[0]) return null;
  return { address: normalizeWalletAddress(rows[0].address) };
}

export async function requireWalletAddress(request = getRequest()): Promise<string> {
  const session = await getWalletSession(request);
  if (!session) throw new AppError("UNAUTHENTICATED", "Wallet authentication required", 401);
  return session.address;
}

export async function revokeWalletSession(request = getRequest()): Promise<void> {
  if (!request) return;
  const token = cookieValue(request);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  const sql = await getSql();
  await sql.query("delete from wallet_sessions where token_hash=$1", [hash(token)]);
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${WALLET_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure}`;
}

export function expiredSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${WALLET_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}
