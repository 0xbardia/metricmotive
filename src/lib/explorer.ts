import {
  findDeploymentsByContract,
  getActiveDeployment,
  getDeploymentByChainAndContract,
  getDeploymentForChain,
  type MetricMotiveDeployment,
} from "../../packages/sdk/src/deployment.ts";

export type Provenance = {
  contractAddress?: string | null;
  chainId?: number | null;
  network?: string | null;
};

function deploymentForProvenance(provenance?: Provenance): MetricMotiveDeployment | null {
  const contractAddress = provenance?.contractAddress ?? null;
  const chainId = provenance?.chainId ?? null;
  try {
    if (contractAddress && chainId != null) {
      return getDeploymentByChainAndContract(Number(chainId), contractAddress);
    }
    if (contractAddress && chainId == null) {
      const matches = findDeploymentsByContract(contractAddress);
      return matches.length === 1 ? matches[0] : null;
    }
    if (chainId != null && !contractAddress) {
      return getDeploymentForChain(Number(chainId));
    }
    return getActiveDeployment();
  } catch {
    return null;
  }
}

export function explorerBaseUrl(provenance?: Provenance): string | null {
  return deploymentForProvenance(provenance)?.explorerUrl ?? null;
}

export function explorerTxUrl(hash: string, provenance?: Provenance): string | null {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
  const base = explorerBaseUrl(provenance);
  if (!base) return null;
  return `${base}/tx/${hash}`;
}

export function explorerAddressUrl(address: string, provenance?: Provenance): string | null {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  const base = explorerBaseUrl(provenance ?? { contractAddress: address });
  if (!base) return null;
  return `${base}/address/${address}`;
}

export type ContractProvenanceLabel = "active" | "historical" | "legacy" | "unknown";

export function contractProvenanceLabel(address: string | null | undefined): ContractProvenanceLabel {
  if (!address) return "unknown";
  const matches = findDeploymentsByContract(address);
  if (matches.length !== 1) return "unknown";
  if (matches[0].status === "active") return "active";
  if (matches[0].status === "legacy") return "legacy";
  return "historical";
}

export function provenanceNetworkCopy(provenance?: Provenance): { network: string; chainId: number; label: string } | null {
  const row = deploymentForProvenance(provenance);
  if (!row) return null;
  const kind = row.status === "active" ? "ACTIVE" : row.status === "legacy" ? "LEGACY" : "HISTORICAL";
  return {
    network: row.networkName,
    chainId: row.chainId,
    label: `${kind} · ${row.networkName} · ${row.chainId}`,
  };
}

/** Live RPC failure must never replace a persisted verdict. */
export function preservePersistedVerdict<T extends { verdict?: string | null; status?: string | null }>(
  persisted: T,
  liveError: unknown,
): T & { liveNetworkUnavailable: boolean } {
  return {
    ...persisted,
    liveNetworkUnavailable: Boolean(liveError),
  };
}
