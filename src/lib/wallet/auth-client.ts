import type { Address, Hex } from "viem";
import type { Connector } from "wagmi";

type WalletProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
type SessionResponse = { address: string | null };

let activeAddress: string | null = null;
let sessionPromise: Promise<void> | null = null;

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message ?? `Wallet authentication failed (${response.status})`);
  return body;
}

export function ensureWalletSession(address: Address, connector: Connector): Promise<void> {
  const normalized = address.toLowerCase();
  if (activeAddress === normalized && sessionPromise) return sessionPromise;
  activeAddress = normalized;
  sessionPromise = (async () => {
    const current = await json<SessionResponse>("/api/v1/auth/session");
    if (current.address?.toLowerCase() === normalized) return;
    if (current.address) await fetch("/api/v1/auth/session", { method: "DELETE", credentials: "include" });
    const challenge = await json<{ nonce: string; message: string }>("/api/v1/auth/nonce", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const provider = (await connector.getProvider()) as WalletProvider | undefined;
    if (!provider || typeof provider.request !== "function") {
      throw new Error("Connected wallet did not expose a signing provider.");
    }
    const signature = await provider.request({
      method: "personal_sign",
      params: [challenge.message, address],
    });
    if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
      throw new Error("Wallet returned an invalid signature.");
    }
    await json("/api/v1/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, nonce: challenge.nonce, signature: signature as Hex }),
    });
  })().catch((error) => {
    activeAddress = null;
    sessionPromise = null;
    throw error;
  });
  return sessionPromise;
}

export function clearWalletSessionCache(): void {
  activeAddress = null;
  sessionPromise = null;
}
