import { DEPLOYMENT, LEGACY_DEPLOYMENT } from "./contract.ts";
export type DocSection = {
  slug: string;
  title: string;
  body: string[];
};

export const DOC_SECTIONS: DocSection[] = [
  {
    slug: "introduction",
    title: "Introduction",
    body: [
      "MetricMotive verifies whether an autonomous agent honored the user's real objective, or gamed the metric it was optimizing.",
      "It exists because Goodhart's law is now an operational risk: agents will hit the number you pay them for. GenLayer is used because the adjudication is semantic, contested, and should not be owned by a single server.",
    ],
  },
  {
    slug: "concepts",
    title: "Concepts",
    body: [
      "Motive: the human objective.",
      "Metric: the measurable proxy.",
      "Guardrails: MUST (hard boundary) and QUALITY (must not be materially sacrificed).",
      "Motive Lock: after arm, the definition is immutable on the Intelligent Contract.",
      "Evidence: a bounded canonical JSON bundle. No secrets or PII.",
      "Verdicts: FAITHFUL_SUCCESS, METRIC_GAMING, PARTIAL_ALIGNMENT, INSUFFICIENT_EVIDENCE.",
      "Gaming patterns: QUALITY_SACRIFICE, CONSTRAINT_BYPASS, DUPLICATION, DECEPTIVE_COMPLETION, RISK_SHIFT, COST_SHIFT, PROXY_EXPLOIT, OTHER, or NONE.",
    ],
  },
  {
    slug: "product",
    title: "Product",
    body: [
      "Create a Guard in six steps: motive, metric, guardrails, preflight, review, lock.",
      "Motive Lock is arm_guard on the certified Studionet contract. The UI shows Motive Locked only after the contract status is ARMED.",
      "Capture a run with the Run Recorder (start, append events, finish).",
      "Submit evidence commits a fingerprint with submit_evidence. Evaluation consumes that commitment.",
      "Verify with GenLayer sends evaluate_guard and waits for a finalized contract verdict. Preflight, loophole scan, drift, and remediation stay advisory.",
      "Public receipts live at /verify/{id} and do not require a wallet.",
      "Versioning creates V2 from a parent. History is not rewritten.",
      "Remediation is advisory. Creating V2 is explicit.",
    ],
  },
  {
    slug: "developers",
    title: "Developers",
    body: [
      "Architecture: TanStack Start app, Postgres for drafts and indexing, GenLayer Intelligent Contract as verdict source of truth.",
      "API: /api/v1/health, /api/v1/ready, /api/v1/contract, /api/v1/openapi.json, /api/v1/runs. Mutations require a wallet session or signed webhook; request-body owners are ignored. Bodies are capped at 32 KiB, event data at 2,000 UTF-8 bytes, runs at 80 events, and list pages at 100. Idempotency keys make safe retries explicit. TypeScript SDK: packages/sdk (@metricmotive/sdk v1.0.0, not published to npm). Example: examples/sales-agent.",
      "Wallet: RainbowKit + wagmi + viem + GenLayerJS. Connect, disconnect, account switch, and Studionet detection are in the product chrome. Writes are signed in the browser. No private key is stored.",
      "Evidence schema: metricmotive.evidence.v1 with SHA-256 canonical JSON hashing.",
      "Contract source: contracts/metric-motive/src/metric_motive.py.",
      "Off-chain AI never overwrites a finalized GenLayer verdict.",
    ],
  },
  {
    slug: "security",
    title: "Security",
    body: [
      "Prompt injection: untrusted motive/metric/rails/evidence are isolated as data.",
      "Access control: only the owner mutates drafts, arms, and submits evidence.",
      "Evidence integrity: commitments cannot be replaced.",
      "Malformed model output is rejected; the contract maps findings deterministically.",
      "Advisory AI can fall back to a labeled heuristic result when the provider is absent, unavailable, or invalid. Advisory output never claims GenLayer authority.",
      "Public evidence paths must not contain secrets.",
      "Report issues via SECURITY.md.",
    ],
  },
  {
    slug: "contract",
    title: "Contract",
    body: [
      "Network: Studionet. Chain ID 61999. RPC https://studio.genlayer.com/api.",
      `Active address: ${DEPLOYMENT.contractAddress}. Read interface verified; real-wallet certification pending.`,
      `Previous deployment ${LEGACY_DEPLOYMENT.contractAddress} hosted certification: Guard 1 FAITHFUL_SUCCESS; Guard 2 METRIC_GAMING (CONSTRAINT_BYPASS). These certify only the previous deployment, not the active deployment.`,
      `Previous deploy transaction: ${LEGACY_DEPLOYMENT.deployTx}.`,
      "Reads: get_contract_info, get_guard_count, get_guard_summary, get_guard_status, get_guard_definition, get_guard_lineage, get_guard_evidence, get_guard_findings, get_guard_verdict, get_guard, get_guards_by_owner. All verified on Studionet for missing IDs and empty state.",
      "Writes: create_guard, update_draft, arm_guard, submit_evidence, evaluate_guard, create_version.",
    ],
  },
  {
    slug: "open-source",
    title: "Open source",
    body: [
      "License: Apache-2.0.",
      "Clone, install npm dependencies, run the documented start command.",
      "Contract tests: python contracts/metric-motive/tests/test_verdict_mapping.py",
      "Domain tests: node --experimental-strip-types --test src/lib/domain.test.ts",
    ],
  },
];
