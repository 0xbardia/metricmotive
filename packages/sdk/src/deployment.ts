export type DeploymentStatus = "active" | "historical" | "legacy";

export type MetricMotiveDeployment = {
  key: string;
  networkName: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  studioUrl: string;
  contractAddress: string;
  status: DeploymentStatus;
};

const STUDIONET_RPC = "https://studio.genlayer.com/api";
const STUDIONET_EXPLORER = "https://explorer-studio.genlayer.com";
const STUDIONET_STUDIO = "https://studio.genlayer.com";

export const DEPLOYMENTS = {
  "studio-dev-v1": {
    key: "studio-dev-v1",
    networkName: "GenLayer Studio Dev",
    chainId: 61997,
    rpcUrl: "https://studio-dev.genlayer.com/api",
    explorerUrl: "https://explorer-studio-dev.genlayer.com",
    studioUrl: "https://studio-dev.genlayer.com",
    contractAddress: "0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703",
    status: "active",
  },
  "studionet-v1": {
    key: "studionet-v1",
    networkName: "Studionet",
    chainId: 61999,
    rpcUrl: STUDIONET_RPC,
    explorerUrl: STUDIONET_EXPLORER,
    studioUrl: STUDIONET_STUDIO,
    contractAddress: "0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d",
    status: "historical",
  },
  "studionet-legacy": {
    key: "studionet-legacy",
    networkName: "Studionet",
    chainId: 61999,
    rpcUrl: STUDIONET_RPC,
    explorerUrl: STUDIONET_EXPLORER,
    studioUrl: STUDIONET_STUDIO,
    contractAddress: "0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8D7C",
    status: "legacy",
  },
} as const satisfies Record<string, MetricMotiveDeployment>;

export type DeploymentKey = keyof typeof DEPLOYMENTS;

const DEPLOYMENT_LIST: MetricMotiveDeployment[] = Object.values(DEPLOYMENTS);

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export function getActiveDeployment(): MetricMotiveDeployment {
  const active = DEPLOYMENT_LIST.filter((row) => row.status === "active");
  if (active.length !== 1) {
    throw new Error("MetricMotive requires exactly one active deployment");
  }
  return active[0];
}

export function getDeploymentByKey(key: string): MetricMotiveDeployment {
  const row = DEPLOYMENT_LIST.find((item) => item.key === key);
  if (!row) throw new Error(`Unknown deployment key: ${key}`);
  return row;
}

export function getDeploymentByChainAndContract(
  chainId: number,
  contractAddress: string,
): MetricMotiveDeployment {
  const address = normalizeAddress(contractAddress);
  const row = DEPLOYMENT_LIST.find(
    (item) => item.chainId === chainId && normalizeAddress(item.contractAddress) === address,
  );
  if (!row) {
    throw new Error("Unsupported Guard deployment");
  }
  return row;
}

export function getDeploymentForChain(chainId: number): MetricMotiveDeployment {
  const rows = DEPLOYMENT_LIST.filter((item) => item.chainId === chainId);
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) throw new Error("Unsupported Guard deployment");
  throw new Error("chainId alone is not sufficient to select a deployment");
}

export function findDeploymentsByContract(contractAddress: string): MetricMotiveDeployment[] {
  const address = normalizeAddress(contractAddress);
  return DEPLOYMENT_LIST.filter((item) => normalizeAddress(item.contractAddress) === address);
}

/** Compatibility: active Studio Dev deployment. */
export const CURRENT_CONTRACT = {
  contractAddress: getActiveDeployment().contractAddress,
  chainId: getActiveDeployment().chainId,
  network: getActiveDeployment().networkName,
  rpcUrl: getActiveDeployment().rpcUrl,
} as const;

export const LEGACY_CONTRACT_ADDRESS = DEPLOYMENTS["studionet-legacy"].contractAddress;
export const HISTORICAL_STUDIONET_CONTRACT_ADDRESS = DEPLOYMENTS["studionet-v1"].contractAddress;
