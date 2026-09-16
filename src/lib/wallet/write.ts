import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type { CalldataEncodable } from "genlayer-js/types";
import type { Connector } from "wagmi";
import { GENLAYER } from "@/lib/domain";
import { confirmationBackoffMs, isTemporaryChainError } from "@/lib/reconciliation";
import { isUserRejection, walletErrorMessage } from "./errors";

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

export type TxWait = "accepted" | "finalized";

export type ChainWriteResult = {
  hash: `0x${string}`;
  execution: string;
  status: unknown;
};

function executionOf(receipt: unknown): string {
  if (!receipt || typeof receipt !== "object") return "";
  const rec = receipt as {
    consensus_data?: { leader_receipt?: unknown };
    txExecutionResultName?: string;
  };
  const leader = rec.consensus_data?.leader_receipt;
  const first = Array.isArray(leader) ? leader[0] : leader;
  if (first && typeof first === "object") {
    const row = first as { execution_result?: unknown; genvm_result?: { error_description?: unknown } };
    const exec = row.execution_result ?? row.genvm_result?.error_description;
    if (exec != null) return String(exec);
  }
  if (rec.txExecutionResultName) return String(rec.txExecutionResultName);
  return "";
}

function isSuccess(execution: string): boolean {
  const u = execution.toUpperCase();
  return u === "SUCCESS" || u.includes("FINISHED_WITH_RETURN") || u === "OK";
}

export async function getConnectorProvider(connector: Connector): Promise<Eip1193Provider> {
  const provider = (await connector.getProvider()) as Eip1193Provider | undefined;
  if (!provider || typeof provider.request !== "function") {
    throw new Error("Connected wallet did not expose an EIP-1193 provider.");
  }
  return provider;
}

export async function writeIntelligentContract(input: {
  contractAddress: string;
  account: `0x${string}`;
  connector: Connector;
  chainId: number;
  functionName: string;
  args: unknown[];
  wait: TxWait;
  onHash?: (hash: `0x${string}`) => void | Promise<void>;
}): Promise<ChainWriteResult> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.contractAddress)) {
    throw new Error("Contract address is not certified.");
  }
  if (input.chainId !== GENLAYER.chainId) {
    throw new Error(`Switch to Studionet (chain ${GENLAYER.chainId}) before sending a write.`);
  }

  const provider = await getConnectorProvider(input.connector);
  const client = createClient({
    chain: studionet,
    account: input.account,
    provider,
  });

  let hash: `0x${string}`;
  try {
    hash = (await client.writeContract({
      address: input.contractAddress as `0x${string}`,
      functionName: input.functionName,
      args: input.args as CalldataEncodable[],
      value: 0n,
    })) as `0x${string}`;
  } catch (err) {
    if (isUserRejection(err)) throw new Error("Wallet request was rejected.");
    throw new Error(walletErrorMessage(err, `Write ${input.functionName} failed`));
  }

  await input.onHash?.(hash);

  const receipt = await waitForTransaction(client, hash, input.wait);
  const receiptStatus = String(receipt.statusName ?? receipt.status ?? "");
  if (receiptStatus === TransactionStatus.CANCELED || receiptStatus === TransactionStatus.UNDETERMINED) {
    throw new Error(`Transaction did not confirm on Studionet (${receiptStatus}).`);
  }
  if (input.wait === "finalized" && receiptStatus !== TransactionStatus.FINALIZED) {
    throw new Error("Transaction submitted. GenLayer finalization is still pending.");
  }

  const execution = executionOf(receipt);
  if (execution && !isSuccess(execution)) {
    throw new Error(
      `Transaction landed but execution failed (${execution}). A hash is not a successful write.`,
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));

  return { hash, execution: execution || "SUCCESS", status: receipt?.status };
}

async function waitForTransaction(
  client: ReturnType<typeof createClient>,
  hash: `0x${string}`,
  wait: TxWait,
): Promise<Awaited<ReturnType<ReturnType<typeof createClient>["getTransaction"]>>> {
  const attempts = wait === "finalized" ? 12 : 8;
  const terminal = new Set(
    wait === "finalized"
      ? [TransactionStatus.FINALIZED, TransactionStatus.CANCELED, TransactionStatus.UNDETERMINED]
      : [TransactionStatus.ACCEPTED, TransactionStatus.FINALIZED, TransactionStatus.CANCELED, TransactionStatus.UNDETERMINED],
  );
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const transaction = await withTimeout(client.getTransaction({ hash: hash as never }), 12_000);
      const status = String(transaction.statusName ?? transaction.status ?? "");
      if (terminal.has(status as TransactionStatus)) return transaction;
      if (attempt === attempts - 1) break;
    } catch (error) {
      if (isTemporaryChainError(error) && /rate limit|too many requests|\b429\b/i.test(error instanceof Error ? error.message : String(error))) {
        throw new Error("Transaction submitted. Confirmation temporarily unavailable.");
      }
      lastError = error;
      if (attempt === attempts - 1) break;
    }
    await waitWhileVisible(confirmationBackoffMs(attempt));
  }
  if (lastError && !isTemporaryChainError(lastError)) {
    throw new Error(walletErrorMessage(lastError, "Transaction confirmation is temporarily unavailable."));
  }
  throw new Error("Transaction submitted. Confirmation temporarily unavailable.");
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Studionet confirmation timed out")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function waitWhileVisible(ms: number): Promise<void> {
  if (typeof document === "undefined" || document.visibilityState !== "hidden") {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
  return new Promise((resolve) => {
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") {
        document.removeEventListener("visibilitychange", onVisibility);
        resolve();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
  });
}
