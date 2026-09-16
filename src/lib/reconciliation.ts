import { abi, decodeInputData } from "genlayer-js";
import type { Address, Hex } from "viem";
import { evidenceCommitmentHash } from "./evidence.ts";
import {
  definitionHash,
  parseGuardrails,
  type Guard,
  type Guardrail,
} from "./domain.ts";

export const CHAIN_OPERATIONS = [
  "create_guard",
  "update_draft",
  "arm_guard",
  "submit_evidence",
  "evaluate_guard",
  "create_version",
] as const;
export type ChainOperation = (typeof CHAIN_OPERATIONS)[number];

export const CREATE_GUARD_OPERATION = "create_guard" as const;
export const CONFIRMATION_UNAVAILABLE_MESSAGE =
  "Transaction submitted. Confirmation temporarily unavailable.";

export class ReconciliationError extends Error {
  readonly code: "MISMATCH" | "MALFORMED";

  constructor(code: "MISMATCH" | "MALFORMED", message: string) {
    super(message);
    this.name = "ReconciliationError";
    this.code = code;
  }
}

export type TransactionVerification =
  | { state: "pending"; status: string }
  | { state: "finalized"; status: "FINALIZED"; onchainId?: string };

export type CreateTransactionResult =
  | { state: "pending"; status: string }
  | { state: "finalized"; status: "FINALIZED"; onchainId: string };

export type TransactionExpectation = {
  operation: ChainOperation;
  txHash: string;
  ownerAddress: string;
  contractAddress: string;
  chainId?: number;
  onchainId?: string | null;
  motive?: string;
  metric?: string;
  guardrails?: Guardrail[];
  definitionHash?: string;
  evidenceJson?: string | null;
  evidenceHash?: string | null;
};

export type DecodedEvidenceTransaction = {
  onchainId: string;
  evidenceJson: string;
  manifest: Record<string, unknown>;
};

type AnyRecord = Record<string, unknown>;

function record(value: unknown): AnyRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : null;
}

function firstString(...values: unknown[]): string | null {
  return values.find((value): value is string => typeof value === "string" && value.length > 0) ?? null;
}

function scalarString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  if (typeof value === "bigint") return value.toString();
  return null;
}

function sameScalar(value: unknown, expected: string): boolean {
  return scalarString(value) === expected;
}

function transactionStatus(tx: AnyRecord): string {
  const named = firstString(tx.statusName, tx.status_name);
  if (named) return named === "ACTIVATED" ? "PENDING" : named;
  if (typeof tx.status === "number" || typeof tx.status === "string") {
    const numeric = Number(tx.status);
    return Number.isInteger(numeric)
      ? (["UNINITIALIZED", "PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "UNDETERMINED", "FINALIZED", "CANCELED", "APPEAL_REVEALING", "APPEAL_COMMITTING", "READY_TO_FINALIZE", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"][numeric] ?? "UNKNOWN")
      : String(tx.status);
  }
  return "UNKNOWN";
}

function normalizeHex(value: unknown): Hex | null {
  if (typeof value !== "string" || !/^(?:0x)?[0-9a-fA-F]+$/.test(value)) return null;
  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

function callEntries(value: unknown): AnyRecord | null {
  if (value instanceof Map) return Object.fromEntries(value.entries()) as AnyRecord;
  return record(value);
}

function rawCalldata(tx: AnyRecord): Uint8Array | null {
  const data = record(tx.data);
  const calldata = record(data?.calldata);
  if (!Array.isArray(calldata?.raw)) return null;
  const bytes = calldata.raw.map((value) => Number(value));
  if (bytes.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return Uint8Array.from(bytes);
}

function decodeCall(tx: AnyRecord, recipient: string): AnyRecord | null {
  const calldata = rawCalldata(tx);
  if (calldata) {
    try {
      const decoded = callEntries(abi.calldata.decode(calldata));
      if (decoded) return decoded;
    } catch {
      // Fall through to the older transaction shapes below.
    }
  }

  const decoded = record(tx.txDataDecoded);
  const decodedCall = decoded?.callData;
  const decodedEntries = callEntries(decodedCall);
  if (decodedEntries) return decodedEntries;

  const raw = normalizeHex(tx.tx_data ?? tx.txData);
  if (!raw) return null;
  const candidates = [raw];
  // Some Studionet responses append the transaction type byte after the RLP
  // app-data.  The SDK decoder accepts the RLP form, not that extra byte.
  if (raw.length > 4 && raw.endsWith("00")) candidates.push(raw.slice(0, -2) as Hex);
  for (const candidate of candidates) {
    const parsed = decodeInputData(candidate, recipient as Address);
    if (parsed?.type === "call") {
      const call = callEntries((parsed as { callData?: unknown }).callData);
      if (call) return call;
    }
  }
  return null;
}

function parseReturnedId(value: unknown): string | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      // Some providers return a plain numeric string rather than JSON text.
    }
  }
  if (typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0) {
    return String(candidate);
  }
  if (typeof candidate === "bigint" && candidate > 0n) return candidate.toString();
  if (typeof candidate === "string" && /^[1-9]\d*$/.test(candidate)) return candidate;
  return null;
}

function returnedIds(tx: AnyRecord): string[] {
  const consensus = record(tx.consensus_data);
  const rawReceipts = consensus?.leader_receipt;
  const receipts = Array.isArray(rawReceipts) ? rawReceipts : rawReceipts ? [rawReceipts] : [];
  const ids: string[] = [];
  for (const rawReceipt of receipts) {
    const receipt = record(rawReceipt);
    if (!receipt || String(receipt.execution_result ?? "").toUpperCase() !== "SUCCESS") continue;
    const result = record(receipt.result);
    if (!result || String(result.status ?? "").toLowerCase() !== "return") continue;
    const payload = record(result.payload);
    const id = parseReturnedId(payload?.readable ?? payload ?? result.readable);
    if (id) ids.push(id);
  }
  return ids;
}

function executionResult(tx: AnyRecord): string | null {
  const consensus = record(tx.consensus_data);
  const rawReceipts = consensus?.leader_receipt;
  const receipt = record(Array.isArray(rawReceipts) ? rawReceipts[0] : rawReceipts);
  const explicit = firstString(receipt?.execution_result, tx.txExecutionResultName, tx.tx_execution_result_name);
  return explicit?.toUpperCase() ?? null;
}

function guardrailDefinition(raw: unknown): Guardrail[] {
  if (typeof raw !== "string") {
    throw new ReconciliationError("MALFORMED", "The submitted transaction has no Guardrails argument.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ReconciliationError("MALFORMED", "The submitted transaction has malformed Guardrails.");
  }
  try {
    return parseGuardrails(parsed);
  } catch {
    throw new ReconciliationError("MISMATCH", "The submitted transaction has invalid Guardrails.");
  }
}

function expectedDefinition(expectation: TransactionExpectation): boolean {
  return Boolean(
    expectation.motive != null &&
      expectation.metric != null &&
      expectation.guardrails != null &&
      expectation.definitionHash,
  );
}

function verifyCommonTransaction(tx: AnyRecord, expected: TransactionExpectation): unknown[] {
  const hash = firstString(tx.hash, tx.tx_id, tx.txId);
  if (!hash || hash.toLowerCase() !== expected.txHash.toLowerCase()) {
    throw new ReconciliationError("MISMATCH", "The transaction hash does not match this Guard operation.");
  }
  const sender = firstString(tx.sender, tx.from_address, tx.from);
  const recipient = firstString(tx.recipient, tx.to_address, tx.to);
  if (!sender || sender.toLowerCase() !== expected.ownerAddress.toLowerCase()) {
    throw new ReconciliationError("MISMATCH", "The transaction sender does not match this Guard owner.");
  }
  if (!recipient || recipient.toLowerCase() !== expected.contractAddress.toLowerCase()) {
    throw new ReconciliationError("MISMATCH", "The transaction contract does not match the certified contract.");
  }
  const chainId = tx.chainId ?? tx.chain_id ?? tx.chainID;
  if (expected.chainId != null && chainId != null && Number(chainId) !== expected.chainId) {
    throw new ReconciliationError("MISMATCH", "The transaction belongs to a different chain.");
  }
  const call = decodeCall(tx, recipient);
  const method = firstString(call?.method);
  const args = call?.args;
  if (method !== expected.operation || !Array.isArray(args)) {
    throw new ReconciliationError("MISMATCH", `The transaction is not the expected ${expected.operation} call.`);
  }
  return args;
}

export function decodeEvidenceTransaction(
  transaction: unknown,
  expected: TransactionExpectation,
): DecodedEvidenceTransaction {
  if (expected.operation !== "submit_evidence") {
    throw new ReconciliationError("MALFORMED", "Evidence decoding requires a submit_evidence operation.");
  }
  const tx = record(transaction);
  if (!tx) throw new ReconciliationError("MALFORMED", "Studionet returned no transaction data.");
  const args = verifyCommonTransaction(tx, expected);
  const onchainId = scalarString(args[0]);
  if (!onchainId || !expected.onchainId || onchainId !== String(expected.onchainId)) {
    throw new ReconciliationError("MISMATCH", "The evidence transaction targets a different on-chain Guard.");
  }
  if (typeof args[1] !== "string") {
    throw new ReconciliationError("MALFORMED", "The evidence transaction has no manifest payload.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(args[1]) as unknown;
  } catch {
    throw new ReconciliationError("MALFORMED", "The evidence transaction has malformed manifest JSON.");
  }
  const manifest = record(parsed);
  if (!manifest) {
    throw new ReconciliationError("MALFORMED", "The evidence transaction manifest is not an object.");
  }
  return { onchainId, evidenceJson: args[1], manifest };
}

export async function verifyTransaction(
  transaction: unknown,
  expected: TransactionExpectation,
): Promise<TransactionVerification> {
  const tx = record(transaction);
  if (!tx) throw new ReconciliationError("MALFORMED", "Studionet returned no transaction data.");
  const args = verifyCommonTransaction(tx, expected);
  const onchainId = expected.onchainId ? String(expected.onchainId) : null;

  if (expected.operation === "create_guard" || expected.operation === "create_version") {
    const definitionOffset = expected.operation === "create_version" ? 1 : 0;
    if (args.length < definitionOffset + 3) {
      throw new ReconciliationError("MALFORMED", `The ${expected.operation} call has incomplete arguments.`);
    }
    if (expected.operation === "create_version" && !sameScalar(args[0], String(expected.onchainId ?? ""))) {
      throw new ReconciliationError("MISMATCH", "The version transaction does not target the expected parent Guard.");
    }
    if (expected.motive != null && args[definitionOffset] !== expected.motive || expected.metric != null && args[definitionOffset + 1] !== expected.metric) {
      throw new ReconciliationError("MISMATCH", "The submitted definition does not match this Guard.");
    }
    if (expectedDefinition(expected)) {
      const submittedGuardrails = guardrailDefinition(args[definitionOffset + 2]);
      if (await definitionHash(expected.motive!, expected.metric!, submittedGuardrails) !== expected.definitionHash) {
        throw new ReconciliationError("MISMATCH", "The submitted Guardrail definition does not match this Guard.");
      }
    }
  } else {
    if (!onchainId || !sameScalar(args[0], onchainId)) {
      throw new ReconciliationError("MISMATCH", "The transaction targets a different on-chain Guard.");
    }
    if (expected.operation === "update_draft") {
      if (args.length < 4) throw new ReconciliationError("MALFORMED", "The update_draft call has incomplete arguments.");
      if (expected.motive != null && args[1] !== expected.motive || expected.metric != null && args[2] !== expected.metric) {
        throw new ReconciliationError("MISMATCH", "The submitted draft definition does not match this Guard.");
      }
      if (expectedDefinition(expected)) {
        const rails = guardrailDefinition(args[3]);
        if (await definitionHash(expected.motive!, expected.metric!, rails) !== expected.definitionHash) {
          throw new ReconciliationError("MISMATCH", "The submitted draft Guardrail definition does not match this Guard.");
        }
      }
    }
    if (expected.operation === "submit_evidence") {
      if (expected.evidenceJson != null && args[1] !== expected.evidenceJson) {
        throw new ReconciliationError("MISMATCH", "The submitted evidence does not match this Guard operation.");
      }
      if (expected.evidenceHash != null) {
        if (typeof args[1] !== "string") {
          throw new ReconciliationError("MALFORMED", "The evidence transaction has no manifest payload.");
        }
        let manifest: unknown;
        try {
          manifest = JSON.parse(args[1]) as unknown;
        } catch {
          throw new ReconciliationError("MALFORMED", "The evidence transaction has malformed manifest JSON.");
        }
        const computed = await evidenceCommitmentHash(manifest as never);
        if (computed !== expected.evidenceHash) {
          throw new ReconciliationError("MISMATCH", "The committed evidence hash does not match this transaction.");
        }
      }
    }
  }

  const status = transactionStatus(tx);
  if (status !== "FINALIZED") {
    if (status === "CANCELED" || status === "UNDETERMINED") {
      throw new ReconciliationError("MALFORMED", `The transaction ended with status ${status}.`);
    }
    return { state: "pending", status };
  }
  const execution = executionResult(tx);
  if (execution && execution !== "SUCCESS" && !execution.includes("FINISHED_WITH_RETURN") && execution !== "OK") {
    throw new ReconciliationError("MALFORMED", `The finalized transaction did not execute successfully (${execution}).`);
  }

  if (expected.operation !== "create_guard" && expected.operation !== "create_version") {
    return { state: "finalized", status: "FINALIZED" };
  }
  const ids = returnedIds(tx);
  if (ids.length === 0) {
    throw new ReconciliationError("MALFORMED", `The finalized ${expected.operation} transaction has no Guard ID return value.`);
  }
  if (new Set(ids).size !== 1) {
    throw new ReconciliationError("MISMATCH", "Validator return values disagree on the Guard ID.");
  }
  return { state: "finalized", status: "FINALIZED", onchainId: ids[0]! };
}

export async function verifyCreateTransaction(
  transaction: unknown,
  expected: Pick<Guard, "id" | "ownerAddress" | "motive" | "metric" | "guardrails" | "definitionHash"> & {
    txHash: string;
    contractAddress: string;
  },
): Promise<CreateTransactionResult> {
  const result = await verifyTransaction(transaction, {
    operation: "create_guard",
    txHash: expected.txHash,
    ownerAddress: expected.ownerAddress,
    contractAddress: expected.contractAddress,
    motive: expected.motive,
    metric: expected.metric,
    guardrails: expected.guardrails,
    definitionHash: expected.definitionHash,
  });
  if (result.state === "pending") return result;
  if (!result.onchainId) throw new ReconciliationError("MALFORMED", "The create transaction returned no Guard ID.");
  return { ...result, onchainId: result.onchainId };
}

export async function verifyChainGuard(
  chainValue: unknown,
  expected: Pick<Guard, "ownerAddress" | "motive" | "metric" | "guardrails" | "definitionHash">,
  onchainId: string,
  allowedStatuses: string[],
): Promise<AnyRecord> {
  const chain = record(chainValue);
  if (!chain || chain.found !== true) {
    throw new ReconciliationError("MALFORMED", "Studionet did not return the reconciled Guard.");
  }
  if (String(chain.id) !== onchainId) throw new ReconciliationError("MISMATCH", "Studionet returned a different Guard ID.");
  const owner = firstString(chain.owner);
  if (!owner || owner.toLowerCase() !== expected.ownerAddress.toLowerCase()) {
    throw new ReconciliationError("MISMATCH", "The reconciled Guard owner does not match the submitted wallet.");
  }
  if (chain.motive !== expected.motive || chain.metric !== expected.metric) {
    throw new ReconciliationError("MISMATCH", "The Studionet Guard definition does not match this workspace Guard.");
  }
  const rails = guardrailDefinition(chain.guardrails_json);
  const chainHash = await definitionHash(String(chain.motive), String(chain.metric), rails);
  if (chainHash !== expected.definitionHash || chain.definition_hash && chain.definition_hash !== expected.definitionHash) {
    throw new ReconciliationError("MISMATCH", "The Studionet Guardrail definition does not match this workspace Guard.");
  }
  if (!allowedStatuses.includes(String(chain.status))) {
    throw new ReconciliationError("MISMATCH", `The reconciled Studionet Guard is unexpectedly ${String(chain.status)}.`);
  }
  return chain;
}

export async function verifyCreateChainGuard(
  chainValue: unknown,
  expected: Pick<Guard, "ownerAddress" | "motive" | "metric" | "guardrails" | "definitionHash">,
  onchainId: string,
): Promise<AnyRecord> {
  return verifyChainGuard(chainValue, expected, onchainId, ["DRAFT"]);
}

export function isTemporaryChainError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /rate limit|too many requests|\b429\b|\b500\b|\b502\b|\b503\b|timeout|timed out|network|fetch failed|econnreset|aborted|temporarily unavailable|not found/i.test(message);
}

export function confirmationBackoffMs(attempt: number): number {
  return Math.min(30_000, 1_500 * 2 ** Math.max(0, attempt));
}
