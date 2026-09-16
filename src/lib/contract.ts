import { GENLAYER } from "./domain.ts";
import { CURRENT_CONTRACT, LEGACY_CONTRACT_ADDRESS } from "../../packages/sdk/src/deployment.ts";
import type { Guard } from "./domain.ts";

/** Filled only after a verified Studionet deployment. Empty means not yet certified. */
export const LEGACY_DEPLOYMENT = {
  network: GENLAYER.network,
  chainId: GENLAYER.chainId,
  rpcUrl: GENLAYER.rpcUrl,
  studioUrl: GENLAYER.studioUrl,
  explorerUrl: GENLAYER.explorerUrl,
  contractAddress: LEGACY_CONTRACT_ADDRESS,
  deployTx: "0xb7cde061b32726e6abfafb2a83868b8d4993028769dc5c5f6fa6e90d89f7ffda",
  deployer: "0xEb2C34eBD96739338427807BE9b70d4278D6A5ec",
  contractVersion: "1.0.0",
  certified: true,
  certifiedAt: "2026-09-12T07:46:34Z",
  source: "contracts/metric-motive/src/metric_motive.py",
  sourceSha256:
    "0e5f3cc0103e5f785fe12b34ecd478dfc909014a40d803ccf98227bb77a7cee1",
  sourceBytes: 24683,
  validatorsAgreed: 4,
  execution: "SUCCESS",
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

export const DEPLOYMENT = {
  ...LEGACY_DEPLOYMENT,
  ...CURRENT_CONTRACT,
  deployTx: "Not independently recorded",
  deployer: "0xAfdd7BB72513E8516f4F1d43F9bA9cC7A611F677",
  certified: false,
  readCertified: true,
  certifiedAt: "",
  validatorsAgreed: 0,
  execution: "Real-wallet certification pending",
} as const;

export function guardDeployment(guard: Pick<Guard, "contractAddress" | "chainId" | "txCreateContract" | "txCreateChainId" | "onchainId" | "txCreate">) {
  const contractAddress = guard.contractAddress ?? guard.txCreateContract;
  if (!contractAddress && (guard.onchainId || guard.txCreate)) {
    throw new Error("Historical Guard contract provenance is missing; refusing to infer the current deployment.");
  }
  const chainId = guard.chainId ?? guard.txCreateChainId ?? CURRENT_CONTRACT.chainId;
  if (chainId !== CURRENT_CONTRACT.chainId || (contractAddress && ![CURRENT_CONTRACT.contractAddress.toLowerCase(), LEGACY_CONTRACT_ADDRESS.toLowerCase()].includes(contractAddress.toLowerCase()))) {
    throw new Error("Unsupported Guard deployment");
  }
  return { ...CURRENT_CONTRACT, contractAddress: contractAddress ?? CURRENT_CONTRACT.contractAddress, chainId };
}

export function hasCertifiedContract(): boolean {
  return Boolean(DEPLOYMENT.readCertified && DEPLOYMENT.contractAddress);
}
