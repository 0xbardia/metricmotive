import { createClient, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import type { CalldataEncodable } from "genlayer-js/types";
import type { Connector } from "wagmi";
import { getActiveDeployment } from "../contract.ts";
import { isUserRejection, walletErrorMessage } from "./errors.ts";

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

export type TxWait = "accepted" | "finalized";

export type ChainWriteResult = {
  hash: `0x${string}`;
  execution: string;
  status: unknown;
  feeValue: bigint;
};

export const LIFECYCLE_WRITE_METHODS = [
  "create_guard",
  "update_draft",
  "arm_guard",
  "submit_evidence",
  "create_version",
  "evaluate_guard",
] as const;
export type LifecycleWriteMethod = (typeof LIFECYCLE_WRITE_METHODS)[number];

export type LifecycleWriteDescriptor = {
  address: `0x${string}`;
  functionName: LifecycleWriteMethod;
  args: CalldataEncodable[];
};

export class LifecycleWriteError extends Error {
  readonly code: "INSUFFICIENT_GEN_FOR_FEES" | "FEE_ESTIMATION_FAILED" | "HISTORICAL_DEPLOYMENT_READ_ONLY" | "WRITE_NOT_SUCCESSFUL";
  readonly feeValue?: bigint;
  constructor(
    code: LifecycleWriteError["code"],
    message: string,
    feeValue?: bigint,
  ) {
    super(message);
    this.code = code;
    this.feeValue = feeValue;
  }
}

export type FeeEstimate = {
  distribution: unknown;
  feeValue: bigint;
};

export type LifecycleWriteDeps = {
  estimateTransactionFeesForWrite: (write: LifecycleWriteDescriptor & { account: `0x${string}` }) => Promise<FeeEstimate>;
  getBalance: (address: `0x${string}`) => Promise<bigint>;
  writeContract: (input: LifecycleWriteDescriptor & {
    account: `0x${string}`;
    fees: { distribution: unknown; feeValue: bigint };
  }) => Promise<`0x${string}`>;
  waitForFinalization: (hash: `0x${string}`) => Promise<unknown>;
  isSuccessful: (transaction: unknown) => boolean;
};

export function isLifecycleWriteMethod(name: string): name is LifecycleWriteMethod {
  return (LIFECYCLE_WRITE_METHODS as readonly string[]).includes(name);
}

export function assertActiveLifecycleTarget(chainId: number, contractAddress: string): void {
  const active = getActiveDeployment();
  if (chainId !== active.chainId || contractAddress.toLowerCase() !== active.contractAddress.toLowerCase()) {
    throw new LifecycleWriteError(
      "HISTORICAL_DEPLOYMENT_READ_ONLY",
      "Historical deployment — read only",
    );
  }
}

export function sameWriteDescriptor(a: LifecycleWriteDescriptor, b: LifecycleWriteDescriptor): boolean {
  return (
    a.address.toLowerCase() === b.address.toLowerCase() &&
    a.functionName === b.functionName &&
    JSON.stringify(a.args) === JSON.stringify(b.args)
  );
}

export async function submitLifecycleWrite(
  input: {
    account: `0x${string}`;
    write: LifecycleWriteDescriptor;
    chainId: number;
  },
  deps: LifecycleWriteDeps,
): Promise<{ hash: `0x${string}`; transaction: unknown; feeValue: bigint; estimate: FeeEstimate }> {
  assertActiveLifecycleTarget(input.chainId, input.write.address);
  if (!isLifecycleWriteMethod(input.write.functionName)) {
    throw new Error(`Unsupported lifecycle write ${input.write.functionName}`);
  }

  let estimate: FeeEstimate;
  try {
    estimate = await deps.estimateTransactionFeesForWrite({
      ...input.write,
      account: input.account,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[lifecycle-write] FEE_ESTIMATION_FAILED", detail);
    throw new LifecycleWriteError(
      "FEE_ESTIMATION_FAILED",
      "Could not estimate GenLayer Studio Dev transaction fees. No transaction was sent.",
    );
  }

  if (estimate.feeValue == null || estimate.feeValue <= 0n || estimate.distribution == null) {
    throw new LifecycleWriteError(
      "FEE_ESTIMATION_FAILED",
      "Could not estimate GenLayer Studio Dev transaction fees. No transaction was sent.",
    );
  }

  const balance = await deps.getBalance(input.account);
  if (balance < estimate.feeValue) {
    throw new LifecycleWriteError(
      "INSUFFICIENT_GEN_FOR_FEES",
      "This wallet does not have enough GEN to pay Studio Dev transaction fees. Fund the wallet, then try again. No transaction was sent.",
      estimate.feeValue,
    );
  }

  const submitted: LifecycleWriteDescriptor = {
    address: input.write.address,
    functionName: input.write.functionName,
    args: input.write.args,
  };
  if (!sameWriteDescriptor(input.write, submitted)) {
    throw new Error("Write descriptor drifted between estimate and submit.");
  }

  const hash = await deps.writeContract({
    ...submitted,
    account: input.account,
    fees: {
      distribution: estimate.distribution,
      feeValue: estimate.feeValue,
    },
  });

  const transaction = await deps.waitForFinalization(hash);
  if (!deps.isSuccessful(transaction)) {
    throw new LifecycleWriteError(
      "WRITE_NOT_SUCCESSFUL",
      "The transaction was not successful. No on-chain state was created.",
    );
  }
  return { hash, transaction, feeValue: estimate.feeValue, estimate };
}

export async function getConnectorProvider(connector: Connector): Promise<Eip1193Provider> {
  const provider = (await connector.getProvider()) as Eip1193Provider | undefined;
  if (!provider || typeof provider.request !== "function") {
    throw new Error("Connected wallet did not expose an EIP-1193 provider.");
  }
  return provider;
}

async function hexToBigInt(raw: unknown): Promise<bigint> {
  if (typeof raw === "bigint") return raw;
  if (typeof raw === "number") return BigInt(raw);
  if (typeof raw === "string") return BigInt(raw);
  return 0n;
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
  const active = getActiveDeployment();
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.contractAddress)) {
    throw new Error("Contract address is not certified.");
  }
  if (input.chainId !== studioDevnet.id || input.chainId !== active.chainId) {
    throw new Error("Switch to GenLayer Studio Dev");
  }
  assertActiveLifecycleTarget(input.chainId, input.contractAddress);
  if (!isLifecycleWriteMethod(input.functionName)) {
    throw new Error(`Unsupported lifecycle write ${input.functionName}`);
  }

  const provider = await getConnectorProvider(input.connector);
  const liveChain = await readProviderChainId(provider);
  if (liveChain !== studioDevnet.id) {
    throw new Error("Switch to GenLayer Studio Dev");
  }

  const readClient = createClient({ chain: studioDevnet });
  const writeClient = createClient({
    chain: studioDevnet,
    account: input.account,
    provider,
  });

  const write: LifecycleWriteDescriptor = {
    address: input.contractAddress as `0x${string}`,
    functionName: input.functionName,
    args: input.args as CalldataEncodable[],
  };

  let submittedHash: `0x${string}` | null = null;
  try {
    const result = await submitLifecycleWrite(
      { account: input.account, write, chainId: input.chainId },
      {
        estimateTransactionFeesForWrite: async (descriptor) => {
          // genlayer-js reads account.address (Account-like). A bare 0x string
          // becomes from=0x0 and owner-gated methods such as arm_guard fail simulation.
          const estimate = await writeClient.estimateTransactionFeesForWrite({
            account: { address: descriptor.account } as never,
            address: descriptor.address,
            functionName: descriptor.functionName,
            args: descriptor.args,
          });
          return { distribution: estimate.distribution, feeValue: BigInt(estimate.feeValue) };
        },
        getBalance: async (address) => {
          const raw = await readClient.request({
            method: "eth_getBalance",
            params: [address, "latest"],
          });
          return hexToBigInt(raw);
        },
        writeContract: async (descriptor) => {
          const hash = (await writeClient.writeContract({
            address: descriptor.address,
            functionName: descriptor.functionName,
            args: descriptor.args,
            fees: {
              distribution: descriptor.fees.distribution as never,
              feeValue: descriptor.fees.feeValue,
            },
          })) as `0x${string}`;
          await input.onHash?.(hash);
          submittedHash = hash;
          return hash;
        },
        waitForFinalization: async (hash) => {
          if (input.wait === "accepted") {
            return writeClient.waitForTransactionReceipt({
              hash: hash as never,
              waitUntil: "decided",
              interval: 4000,
              retries: 45,
            });
          }
          return writeClient.waitForFinalization({
            hash: hash as never,
            interval: 4000,
            retries: 90,
          });
        },
        isSuccessful: (transaction) => isSuccessful(transaction as never),
      },
    );
    const rec = result.transaction as {
      statusName?: unknown;
      status?: unknown;
      txExecutionResultName?: unknown;
    };
    return {
      hash: result.hash,
      execution: String(rec.txExecutionResultName ?? "FINISHED_WITH_RETURN"),
      status: rec.statusName ?? rec.status,
      feeValue: result.feeValue,
    };
  } catch (err) {
    if (isUserRejection(err)) throw new Error("Wallet request was rejected.");
    if (err instanceof LifecycleWriteError) throw err;
    if (submittedHash) {
      throw new Error(
        `${walletErrorMessage(err, "Transaction confirmation is delayed")}. Do not submit the transaction again yet. Hash ${submittedHash}`,
      );
    }
    throw new Error(walletErrorMessage(err, `Write ${input.functionName} failed`));
  }
}

async function readProviderChainId(provider: Eip1193Provider): Promise<number> {
  const raw = await provider.request({ method: "eth_chainId" });
  if (typeof raw === "string" && raw.startsWith("0x")) return Number.parseInt(raw, 16);
  return Number(raw);
}
