import { DEPLOYMENT } from "@/lib/contract";
import {
  type Findings,
  type GamingPattern,
  type GuardStatus,
  type Verdict,
  parseGuardrails,
} from "@/lib/domain";
import { AppError } from "@/lib/errors";
import { chainGuardSchema, parseFindingsInput } from "@/lib/validation";
import { getReadClientForContract, getReadClientForProvenance } from "./chain-client";

export type ChainGuardView = {
  found: boolean;
  id: string;
  owner: string;
  parent_id: string;
  version: number;
  motive: string;
  metric: string;
  guardrails_json: string;
  definition_hash: string;
  status: string;
  evidence_json: string;
  evidence_hash: string;
  findings_json: string;
  verdict: string;
  primary_pattern: string;
  created_at: string;
  armed_at: string;
  evidence_at: string;
  resolved_at: string;
};

function jsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
}

export function chainReadClient(address: string = DEPLOYMENT.contractAddress, chainId?: number) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new AppError("INVALID_CONTRACT", "Contract address is invalid", 400);
  if (!DEPLOYMENT.contractAddress) {
    throw new AppError("NOT_CERTIFIED", "Contract is not certified yet", 503);
  }
  const resolved = chainId == null
    ? getReadClientForContract(address)
    : getReadClientForProvenance({ chainId, contractAddress: address });
  return {
    address: address as `0x${string}`,
    client: resolved.client,
    deployment: resolved.deployment,
    chain: resolved.chain,
  };
}

export async function readOnChain(
  functionName: string,
  args: Array<string | number> = [],
  contractAddress: string = DEPLOYMENT.contractAddress,
  chainId?: number,
): Promise<unknown> {
  const { address, client } = chainReadClient(contractAddress, chainId);
  const result = await client.readContract({
    address,
    functionName,
    args,
  });
  return jsonSafe(result);
}

export async function readChainGuard(
  onchainId: string,
  contractAddress: string,
  chainId?: number,
): Promise<ChainGuardView> {
  const idNum = Number(onchainId);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    throw new AppError("INVALID_ID", "On-chain guard id is invalid", 400);
  }
  const raw: unknown = await readOnChain("get_guard", [idNum], contractAddress, chainId);
  const parsed = chainGuardSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("CHAIN_INVALID", "Network returned invalid Guard data", 502);
  }
  const view = parsed.data as ChainGuardView;
  if (!view.found) {
    throw new AppError("NOT_FOUND", "Guard not found on the recorded deployment", 404);
  }
  return view;
}

export function asStatus(value: string): GuardStatus {
  if (value === "DRAFT" || value === "ARMED" || value === "EVIDENCE_SUBMITTED" || value === "RESOLVED") {
    return value;
  }
  throw new AppError("INVALID_STATE", `Unexpected on-chain status ${value}`, 409);
}

export function asVerdict(value: string): Verdict {
  if (
    value === "FAITHFUL_SUCCESS" ||
    value === "METRIC_GAMING" ||
    value === "PARTIAL_ALIGNMENT" ||
    value === "INSUFFICIENT_EVIDENCE"
  ) {
    return value;
  }
  throw new AppError("INVALID_STATE", `Unexpected on-chain verdict ${value}`, 409);
}

export function asPattern(value: string): GamingPattern {
  const allowed = [
    "NONE",
    "QUALITY_SACRIFICE",
    "CONSTRAINT_BYPASS",
    "DUPLICATION",
    "DECEPTIVE_COMPLETION",
    "RISK_SHIFT",
    "COST_SHIFT",
    "PROXY_EXPLOIT",
    "OTHER",
  ] as const;
  if ((allowed as readonly string[]).includes(value)) return value as GamingPattern;
  return "OTHER";
}

export function parseFindings(raw: string): Findings | null {
  if (!raw) return null;
  try {
    return parseFindingsInput(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function chainGuardrails(view: ChainGuardView) {
  return parseGuardrails(view.guardrails_json || "[]");
}
