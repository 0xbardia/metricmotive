import { CURRENT_CONTRACT } from "./deployment.ts";
export const CONTRACT_ADDRESS = CURRENT_CONTRACT.contractAddress;
export const CHAIN_ID = CURRENT_CONTRACT.chainId;
export const RPC_URL = CURRENT_CONTRACT.rpcUrl;

export type GuardrailKind = "MUST" | "QUALITY";

export type Guardrail = {
  kind: GuardrailKind;
  text: string;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonBag = { [key: string]: JsonPrimitive };

export type RunEvent = {
  timestamp: string;
  type: string;
  source: string;
  data: JsonBag;
  artifactRef?: string;
  idempotencyKey?: string;
};

export type EvidenceManifest = {
  schema: "metricmotive.evidence.v1";
  guardId: string;
  runId: string;
  agentRef: string;
  startedAt: string;
  completedAt: string;
  events: RunEvent[];
  outcome: JsonBag;
  manifestHash: string;
};

export type RunRecord = {
  id: string;
  guardId: string;
  agentRef: string;
  status: "STARTED" | "FINISHED";
  events: RunEvent[];
  outcome: JsonBag;
  startedAt: string;
  completedAt: string | null;
  authority: "local-memory" | "http-api";
};

export type ChainGuard = {
  id: string;
  owner: string;
  motive: string;
  metric: string;
  guardrails_json: string;
  status: string;
  evidence_hash: string;
  evidence_json: string;
  findings_json: string;
  verdict: string;
  primary_pattern: string;
  definition_hash?: string;
  found: boolean;
};

export type MetricMotiveClientOptions = {
  /** Active Studionet deployment. Set explicitly for historical resources. */
  contractAddress?: `0x${string}`;
  /** Optional HTTP API base, e.g. http://127.0.0.1:8080. Used by startRun/recordEvent/completeRun. */
  apiUrl?: string;
  /** HMAC secret for the authenticated webhook/API integration. Never log it. */
  webhookSecret?: string;
  /**
   * genlayer-js account from createAccount(privateKey), or an address for reads.
   * Required for on-chain writes. Never pass a raw private key into the constructor.
   */
  account?: `0x${string}` | { address: `0x${string}`; [key: string]: unknown };

};

export type CreateGuardInput = {
  motive: string;
  metric: string;
  guardrails: Guardrail[];
};
