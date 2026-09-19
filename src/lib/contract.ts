import {
  CURRENT_CONTRACT,
  DEPLOYMENTS,
  getActiveDeployment,
  getDeploymentByChainAndContract,
  findDeploymentsByContract,
  type MetricMotiveDeployment,
} from "../../packages/sdk/src/deployment.ts";

export { getActiveDeployment };
import type { Guard } from "./domain.ts";
import { AppError } from "./errors.ts";

const SHARED_INTERFACE = {
  contractVersion: "1.0.0",
  source: "contracts/metric-motive/src/metric_motive.py",
  sourceSha256:
    "0e5f3cc0103e5f785fe12b34ecd478dfc909014a40d803ccf98227bb77a7cee1",
  sourceBytes: 24683,
  readMethods: [
    "get_contract_info",
    "get_guard_count",
    "get_guard_summary",
    "get_guard_status",
    "get_guard_definition",
    "get_guard_lineage",
    "get_guard_evidence",
    "get_guard_findings",
    "get_guard_verdict",
    "get_guard",
    "get_guards_by_owner",
  ],
  writeMethods: [
    "create_guard",
    "update_draft",
    "arm_guard",
    "submit_evidence",
    "evaluate_guard",
    "create_version",
  ],
} as const;

function asCompat(row: MetricMotiveDeployment) {
  return {
    network: row.networkName,
    chainId: row.chainId,
    rpcUrl: row.rpcUrl,
    studioUrl: row.studioUrl,
    explorerUrl: row.explorerUrl,
    contractAddress: row.contractAddress,
  };
}

const historical = DEPLOYMENTS["studionet-v1"];
const legacy = DEPLOYMENTS["studionet-legacy"];
const active = getActiveDeployment();

/** Previous Studionet live contract. Kept for provenance, not as GENLAYER. */
export const HISTORICAL_DEPLOYMENT = {
  ...SHARED_INTERFACE,
  ...asCompat(historical),
  deployTx: "Not independently recorded",
  deployer: "0xAfdd7BB72513E8516f4F1d43F9bA9cC7A611F677",
  certified: true,
  readCertified: true,
  certifiedAt: "",
  validatorsAgreed: 0,
  execution: "Historical Studionet deployment",
} as const;

/** Older legacy Studionet contract. */
export const LEGACY_DEPLOYMENT = {
  ...SHARED_INTERFACE,
  ...asCompat(legacy),
  deployTx: "0xb7cde061b32726e6abfafb2a83868b8d4993028769dc5c5f6fa6e90d89f7ffda",
  deployer: "0xEb2C34eBD96739338427807BE9b70d4278D6A5ec",
  certified: true,
  certifiedAt: "2026-09-12T07:46:34Z",
  validatorsAgreed: 4,
  execution: "SUCCESS",
} as const;

/** Compatibility: active Studio Dev. Write routing is still Stage 2B. */
export const DEPLOYMENT = {
  ...SHARED_INTERFACE,
  ...asCompat(active),
  deployTx: "Not independently recorded",
  deployer: "0xAfdd7BB72513E8516f4F1d43F9bA9cC7A611F677",
  certified: false,
  readCertified: true,
  certifiedAt: "",
  validatorsAgreed: 0,
  execution: "Real-wallet certification pending",
} as const;

function isNewDraft(
  guard: Pick<Guard, "contractAddress" | "chainId" | "txCreateContract" | "txCreateChainId" | "onchainId" | "txCreate">,
): boolean {
  return (
    !guard.onchainId &&
    !guard.txCreate &&
    !guard.contractAddress &&
    guard.chainId == null &&
    !guard.txCreateContract &&
    guard.txCreateChainId == null
  );
}

/**
 * Resolve a Guard to a known deployment.
 *
 * Persisted chainId + contractAddress wins.
 * New drafts (no provenance) may use the active deployment.
 * Bound or partial historical records never inherit the active deployment.
 */
export function guardDeployment(guard: Pick<Guard, "contractAddress" | "chainId" | "txCreateContract" | "txCreateChainId" | "onchainId" | "txCreate">) {
  const contractAddress = guard.contractAddress ?? guard.txCreateContract ?? null;
  const chainIdRaw = guard.chainId ?? guard.txCreateChainId ?? null;
  const chainId = chainIdRaw == null ? null : Number(chainIdRaw);

  if (contractAddress && chainId != null) {
    const row = getDeploymentByChainAndContract(chainId, contractAddress);
    return { ...CURRENT_CONTRACT, ...asCompat(row), contractAddress: row.contractAddress, chainId: row.chainId, status: row.status, key: row.key };
  }

  if (contractAddress && chainId == null) {
    const matches = findDeploymentsByContract(contractAddress);
    if (matches.length === 1) {
      const row = matches[0];
      return { ...CURRENT_CONTRACT, ...asCompat(row), contractAddress: row.contractAddress, chainId: row.chainId, status: row.status, key: row.key };
    }
    throw new Error("Unsupported Guard deployment");
  }

  if (chainId != null && !contractAddress) {
    throw new Error("Historical Guard contract provenance is missing; refusing to infer the current deployment.");
  }

  if (!isNewDraft(guard) || guard.onchainId || guard.txCreate) {
    throw new Error("Historical Guard contract provenance is missing; refusing to infer the current deployment.");
  }

  const row = getActiveDeployment();
  return { ...CURRENT_CONTRACT, ...asCompat(row), contractAddress: row.contractAddress, chainId: row.chainId, status: row.status, key: row.key };
}

export function hasCertifiedContract(): boolean {
  return Boolean(DEPLOYMENT.readCertified && DEPLOYMENT.contractAddress);
}

export function isHistoricalResource(guard: Pick<Guard, "contractAddress" | "chainId" | "txCreateContract" | "txCreateChainId" | "onchainId" | "txCreate">): boolean {
  return resolvedDeployment(guard).status !== "active";
}

export function resolvedDeployment(guard: Pick<Guard, "contractAddress" | "chainId" | "txCreateContract" | "txCreateChainId" | "onchainId" | "txCreate">): MetricMotiveDeployment {
  const resolved = guardDeployment(guard);
  return getDeploymentByChainAndContract(resolved.chainId, resolved.contractAddress);
}

export function requireActiveWrite(deployment: MetricMotiveDeployment): MetricMotiveDeployment {
  const active = getActiveDeployment();
  if (
    deployment.status !== "active" ||
    deployment.chainId !== active.chainId ||
    deployment.contractAddress.toLowerCase() !== active.contractAddress.toLowerCase()
  ) {
    throw new AppError(
      "HISTORICAL_DEPLOYMENT_READ_ONLY",
      "This Guard is on a historical deployment. It can be read and reconciled, but new writes must target the active Studio Dev contract.",
      409,
    );
  }
  return deployment;
}
