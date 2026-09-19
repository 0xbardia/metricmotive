import { createClient } from "genlayer-js";
import { genLayerChainForDeployment, deploymentForContractAddress } from "./chain-preset.ts";
import { getActiveDeployment } from "./deployment.ts";
import { TransactionStatus } from "genlayer-js/types";
import type { CalldataEncodable } from "genlayer-js/types";
import { MetricMotiveError, asError } from "./errors.ts";
import { buildEvidenceManifest, canonicalJson, encodeEvidence, sha256Hex } from "./evidence.ts";
import { HttpRecorder, MemoryRecorder } from "./recorder.ts";
import { resolveCreatedGuardId } from "./create-guard-resolution.ts";
import { parseChainGuard, parseOwnerGuardIds } from "./chain-validation.ts";
import {
  CHAIN_ID,
  CONTRACT_ADDRESS,
  type ChainGuard,
  type CreateGuardInput,
  type EvidenceManifest,
  type JsonBag,
  type MetricMotiveClientOptions,
  type RunEvent,
  type RunRecord,
} from "./types.ts";

function executionOf(receipt: unknown): string {
  if (!receipt || typeof receipt !== "object") return "";
  const rec = receipt as {
    consensus_data?: { leader_receipt?: unknown };
  };
  const leader = rec.consensus_data?.leader_receipt;
  const first = Array.isArray(leader) ? leader[0] : leader;
  if (first && typeof first === "object") {
    const row = first as { execution_result?: unknown };
    if (row.execution_result != null) return String(row.execution_result);
  }
  return "";
}

function isSuccess(execution: string): boolean {
  const u = execution.toUpperCase();
  return !execution || u === "SUCCESS" || u.includes("FINISHED_WITH_RETURN") || u === "OK";
}

/**
 * MetricMotive V1 client.
 *
 * On-chain methods talk to the frozen Studionet Intelligent Contract.
 * Run Recorder methods talk to the HTTP API when `apiUrl` is set, otherwise memory.
 * A local run is never a GenLayer verdict.
 */
export class MetricMotiveClient {
  readonly contractAddress: `0x${string}`;
  readonly chainId = CHAIN_ID;
  readonly apiUrl: string | null;
  private readonly account: MetricMotiveClientOptions["account"];
  private readonly memory = new MemoryRecorder();
  private readonly http: HttpRecorder | null;

  constructor(opts: MetricMotiveClientOptions = {}) {
    this.contractAddress = (opts.contractAddress ?? CONTRACT_ADDRESS) as `0x${string}`;
    this.apiUrl = opts.apiUrl ? opts.apiUrl.replace(/\/$/, "") : null;
    this.account = opts.account;
    this.http = this.apiUrl ? new HttpRecorder(this.apiUrl, opts.webhookSecret) : null;
  }

  private chainClient() {
    const deployment = deploymentForContractAddress(this.contractAddress);
    return createClient({
      chain: genLayerChainForDeployment(deployment),
      account: this.account as never,
    });
  }

  private requireAccount(): void {
    if (!this.account) {
      throw new MetricMotiveError(
        "NEED_ACCOUNT",
        "On-chain writes need a genlayer-js account from createAccount(privateKey).",
        "chain",
      );
    }
  }

  private async write(
    functionName: string,
    args: unknown[],
    wait: "accepted" | "finalized",
  ): Promise<`0x${string}`> {
    this.requireAccount();
    const deployment = deploymentForContractAddress(this.contractAddress);
    if (deployment.status !== "active" || deployment.contractAddress.toLowerCase() !== getActiveDeployment().contractAddress.toLowerCase()) {
      throw new MetricMotiveError(
        "HISTORICAL_DEPLOYMENT_READ_ONLY",
        "Historical deployments are readable only. New writes must target the active Studio Dev contract.",
        "chain",
      );
    }
    const client = this.chainClient();
    let hash: `0x${string}`;
    try {
      hash = (await client.writeContract({
        address: this.contractAddress,
        functionName,
        args: args as CalldataEncodable[],
        value: 0n,
      })) as `0x${string}`;
    } catch (err) {
      throw new MetricMotiveError(
        "WRITE_FAILED",
        asError(err, `write ${functionName} failed`).message,
        "chain",
      );
    }
    let receipt: unknown;
    try {
      receipt = await client.waitForTransactionReceipt({
        hash: hash as never,
        status:
          wait === "finalized" ? TransactionStatus.FINALIZED : TransactionStatus.ACCEPTED,
        interval: 4000,
        retries: wait === "finalized" ? 180 : 90,
      });
    } catch {
      throw new MetricMotiveError(
        "CONFIRMATION_PENDING",
        `Transaction confirmation is delayed; retain ${hash} and retry confirmation.`,
        "chain",
        hash,
      );
    }
    const execution = executionOf(receipt);
    if (!isSuccess(execution)) {
      throw new MetricMotiveError(
        "EXECUTION_FAILED",
        `Transaction landed but execution failed (${execution}). A hash is not a successful write.`,
        "chain",
        hash,
      );
    }
    return hash;
  }

  async getGuard(id: number | string): Promise<ChainGuard> {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId < 0) {
      throw new MetricMotiveError("VALIDATION", "Guard id is invalid", "chain");
    }
    const client = this.chainClient();
    const result = await client.readContract({
      address: this.contractAddress,
      functionName: "get_guard",
      args: [numericId],
    });
    return parseChainGuard(result);
  }

  async getVerdict(id: number | string): Promise<{
    verdict: string;
    findings: string;
    primaryPattern: string;
    status: string;
    guard: ChainGuard;
  }> {
    const guard = await this.getGuard(id);
    return {
      verdict: String(guard.verdict ?? ""),
      findings: String(guard.findings_json ?? ""),
      primaryPattern: String(guard.primary_pattern ?? ""),
      status: String(guard.status ?? ""),
      guard,
    };
  }

  async createGuard(input: CreateGuardInput): Promise<{ onchainId: string; txHash: `0x${string}` }> {
    const rails = JSON.stringify(input.guardrails);
    const txHash = await this.write("create_guard", [input.motive, input.metric, rails], "accepted");
    const client = this.chainClient();
    const owner = typeof this.account === "string" ? this.account : this.account?.address;
    if (!owner) {
      throw new MetricMotiveError("NEED_ACCOUNT", "Guard creation needs an account address", "chain");
    }
    const result: unknown = await client.readContract({
      address: this.contractAddress,
      functionName: "get_guards_by_owner",
      args: [owner],
    });
    const ids = parseOwnerGuardIds(result);
    const candidates: Array<{
      id: string;
      motive: string;
      metric: string;
      guardrails_json: string;
      definition_hash?: string;
    }> = [];
    const definitionHash = await this.definitionHash(input);
    for (const id of ids) {
      const guard = await this.getGuard(id);
      candidates.push({
        id: String(guard.id),
        motive: String(guard.motive),
        metric: String(guard.metric),
        guardrails_json: String(guard.guardrails_json),
        definition_hash: guard.definition_hash,
      });
    }
    try {
      return { onchainId: resolveCreatedGuardId(candidates, input, definitionHash), txHash };
    } catch (err) {
      if (err instanceof MetricMotiveError) {
        throw new MetricMotiveError(err.code, `${err.message} Transaction: ${txHash}`, "chain", txHash);
      }
      throw err;
    }
  }

  private async definitionHash(input: CreateGuardInput): Promise<string> {
    return sha256Hex(canonicalJson({
      guardrails: input.guardrails,
      metric: input.metric,
      motive: input.motive,
    }));
  }

  async armGuard(id: number | string): Promise<{ txHash: `0x${string}`; status: string }> {
    const txHash = await this.write("arm_guard", [Number(id)], "accepted");
    const guard = await this.getGuard(id);
    if (guard.status !== "ARMED" && guard.status !== "EVIDENCE_SUBMITTED" && guard.status !== "RESOLVED") {
      throw new MetricMotiveError(
        "NOT_ARMED",
        `Studionet has not confirmed ARMED (status ${guard.status})`,
        "chain",
      );
    }
    return { txHash, status: String(guard.status) };
  }

  async submitEvidence(
    id: number | string,
    evidence: EvidenceManifest | string,
  ): Promise<{ txHash: `0x${string}`; evidenceHash: string }> {
    const encoded = typeof evidence === "string" ? evidence : encodeEvidence(evidence);
    if (encoded.length > 8000) {
      throw new MetricMotiveError("LIMIT", "Evidence bundle exceeds 8000 bytes", "chain");
    }
    const txHash = await this.write("submit_evidence", [Number(id), encoded], "accepted");
    const guard = await this.getGuard(id);
    return { txHash, evidenceHash: String(guard.evidence_hash ?? "") };
  }

  async evaluateGuard(id: number | string): Promise<{ txHash: `0x${string}` }> {
    const txHash = await this.write("evaluate_guard", [Number(id)], "finalized");
    return { txHash };
  }

  async waitForVerdict(
    id: number | string,
    opts: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<{ verdict: string; status: string; guard: ChainGuard }> {
    const timeoutMs = opts.timeoutMs ?? 12 * 60_000;
    const intervalMs = opts.intervalMs ?? 4000;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const guard = await this.getGuard(id);
      if (guard.status === "RESOLVED" && guard.verdict && guard.verdict !== "NONE") {
        return { verdict: String(guard.verdict), status: String(guard.status), guard };
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new MetricMotiveError("TIMEOUT", `Guard ${id} did not finalize in time`, "chain");
  }

  async startRun(input: { guardId: string; agentRef?: string; idempotencyKey?: string }): Promise<RunRecord> {
    if (this.http) return this.http.startRun(input);
    return this.memory.startRun(input);
  }

  async recordEvent(runId: string, event: RunEvent): Promise<RunRecord> {
    if (this.http) return this.http.recordEvent(runId, event);
    return this.memory.recordEvent(runId, event);
  }

  async completeRun(runId: string, outcome: JsonBag = {}): Promise<RunRecord> {
    if (this.http) return this.http.completeRun(runId, outcome);
    return this.memory.completeRun(runId, outcome);
  }

  async evidenceFromRun(guardId: string, run: string | RunRecord): Promise<EvidenceManifest> {
    const record =
      typeof run === "string"
        ? this.memory.getRun(run)
        : run;
    if (record.status !== "FINISHED") {
      throw new MetricMotiveError("INVALID_STATE", "Finish the run before building evidence");
    }
    return buildEvidenceManifest({ guardId, run: record });
  }
}

export { buildEvidenceManifest, encodeEvidence, eventOf } from "./evidence.ts";
