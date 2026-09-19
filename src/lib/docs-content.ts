import { CURRENT_CONTRACT } from "../../packages/sdk/src/deployment.ts";
import { HISTORICAL_DEPLOYMENT, LEGACY_DEPLOYMENT } from "./contract.ts";
import { GENLAYER } from "./domain.ts";

/**
 * Documentation content.
 *
 * Held as data rather than JSX so the page stays a layout concern and the copy
 * is testable. Deployment values are imported from the modules the app itself
 * runs on, so the docs cannot drift from the contract the product uses and no
 * address or chain id is ever typed out by hand.
 */

export const PRODUCTION_URL = "https://metricmotive.xyz";
export const REPOSITORY_URL = "https://github.com/0xbardia/metricmotive";

export const DEPLOYMENT_FACTS = {
  production: PRODUCTION_URL,
  network: GENLAYER.network,
  chainId: GENLAYER.chainId,
  contract: CURRENT_CONTRACT.contractAddress,
  legacyContract: LEGACY_DEPLOYMENT.contractAddress,
  historicalContract: HISTORICAL_DEPLOYMENT.contractAddress,
  explorer: GENLAYER.explorerUrl,
  rpc: GENLAYER.rpcUrl,
  repository: REPOSITORY_URL,
  license: "Apache-2.0",
} as const;

export type DocSection = {
  slug: string;
  title: string;
  /** Short label for navigation; falls back to `title`. */
  nav?: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: { head: string[]; rows: string[][] };
  code?: { label: string; language: string; source: string };
  links?: { label: string; href: string }[];
};

const CONTRACT_SOURCE = `contracts/metric-motive/src/metric_motive.py`;

const SDK_SAMPLE = `import { MetricMotiveClient, eventOf } from "@metricmotive/sdk";

const mm = new MetricMotiveClient({ apiUrl: process.env.METRICMOTIVE_API_URL });
const run = await mm.startRun({ guardId: "grd_…", agentRef: "sales-agent" });

await mm.recordEvent(run.id, eventOf("bookings", { meetings_booked: 12 }, "crm"));
await mm.completeRun(run.id, { recorded: true });`;

export const DOC_SECTIONS: DocSection[] = [
  {
    slug: "environment",
    title: "Deployment environment",
    nav: "Environment",
    paragraphs: [
      "MetricMotive's active submission deployment is currently on GenLayer Studio Dev (61997). This is a Studio development network, not a mainnet, and it does not carry permanent state guarantees.",
      "Historical receipts may reference Studionet (61999). Receipts preserve their original chain and contract provenance; a later active deployment never rewrites them.",
    ],
    table: {
      head: ["Field", "Value"],
      rows: [
        ["Active network", DEPLOYMENT_FACTS.network],
        ["Active chain ID", String(DEPLOYMENT_FACTS.chainId)],
        ["Active RPC", DEPLOYMENT_FACTS.rpc],
        ["Active contract", DEPLOYMENT_FACTS.contract],
        ["Active explorer", DEPLOYMENT_FACTS.explorer],
        ["Previous Studionet contract", DEPLOYMENT_FACTS.historicalContract],
        ["Older legacy contract", DEPLOYMENT_FACTS.legacyContract],
      ],
    },
  },
  {
    slug: "overview",
    title: "Overview",
    paragraphs: [
      "MetricMotive verifies whether an autonomous agent achieved the metric it was given while still honoring the motive behind that metric and the guardrails that constrain it.",
      "Your agent hit the metric. Did it honor the motive? That question is semantic, contested, and consequential, so it is answered on GenLayer rather than by the vendor whose agent is being judged.",
      "A Guard is the unit of work: one Motive, one Metric, and the Guardrails that must hold. The definition is published and then locked on GenLayer, evidence is committed against that locked version, and the Intelligent Contract produces the findings and the verdict.",
    ],
  },
  {
    slug: "why",
    title: "Why MetricMotive",
    paragraphs: [
      "Goodhart's law is an operational risk, not an observation. Any number an agent is paid to move becomes a target, and targets get gamed: duplicates counted twice, prospects outside the audience booked to fill a calendar, outreach that misstates its purpose.",
      "A dashboard reports the metric — which is exactly the thing being gamed. MetricMotive records what the metric cannot express, the quality, scope, and honesty conditions it was meant to stand for, and asks an independent contract to judge them.",
    ],
    bullets: [
      "The specification is locked before the result exists, so it cannot be rewritten after seeing the outcome.",
      "Evidence is committed before evaluation, so a verdict cannot be reverse-engineered from a preferred answer.",
      "Findings are semantic and set by GenLayer; the verdict is mapped from them deterministically by the contract.",
    ],
  },
  {
    slug: "concepts",
    title: "Core concepts",
    table: {
      head: ["Term", "Definition"],
      rows: [
        ["Motive", "The human objective: the real outcome the work was supposed to produce."],
        ["Metric", "The measurable proxy for the motive. Useful, but gameable on its own."],
        ["Guardrail", "A MUST (hard boundary) or QUALITY (must not be materially sacrificed) constraint."],
        ["Guard", "The locked specification: Motive, Metric, Guardrails, and its definition fingerprint."],
        ["Run", "One execution that produces evidence for a Guard."],
        ["Evidence", "A bounded canonical JSON bundle of recorded events. No secrets, no PII."],
        ["Findings", "The semantic questions GenLayer answers about the evidence."],
        ["Verdict", "The deterministic mapping of those findings into one of four outcomes."],
        ["Receipt", "The public document recording the finalized result and its provenance."],
      ],
    },
  },
  {
    slug: "lifecycle",
    title: "Guard lifecycle",
    nav: "Lifecycle",
    paragraphs: [
      "The Guard Builder (Define, Protect, Review, Publish) produces a specification. The Case lifecycle (Draft, Lock, Run, Verify) governs that specification once it exists. They are separate systems, and the interface labels which one you are in.",
    ],
    bullets: [
      "Define — state the Motive and the Metric that proxies it.",
      "Protect — add the Guardrails that must not be sacrificed, with advisory preflight and loophole scanning.",
      "Review — read the specification as one document.",
      "Publish — create the Guard on GenLayer. One wallet transaction.",
      "Lock — freeze the Motive, Metric, and Guardrails. A separate wallet transaction.",
      "Run — capture what the agent actually did, manually or through an agent integration.",
      "Commit evidence — the finished Run's canonical manifest and fingerprint go to the contract.",
      "Verify — GenLayer evaluates the committed evidence against the locked specification.",
      "Receipt — the finalized findings, verdict, and provenance become a public document.",
    ],
    paragraphsAfter: [],
  } as DocSection & { paragraphsAfter?: string[] },
  {
    slug: "evidence",
    title: "Evidence model",
    nav: "Evidence",
    paragraphs: [
      "Evidence is recorded as discrete events while a Run is open. Finishing the Run builds the canonical manifest once and persists it exactly as submitted, so the bytes the wallet committed are the bytes replayed afterwards. Nothing is regenerated from mutable rows.",
      "Events are canonically serialized — stable key order, stable timestamps, stable Unicode normalization — and hashed twice, for two distinct purposes.",
    ],
    table: {
      head: ["Digest", "What it commits to"],
      rows: [
        [
          "manifestHash",
          "SHA-256 over the canonical manifest without the manifestHash field: the inner fingerprint of the evidence bundle itself.",
        ],
        [
          "Evidence commitment",
          "SHA-256 over the canonical manifest including manifestHash. This is what the contract stores and reconciles against.",
        ],
      ],
    },
  },
  {
    slug: "verification",
    title: "Verification with GenLayer",
    nav: "Verification",
    paragraphs: [
      "GenLayer validators read the committed evidence against the locked specification and answer the semantic questions. The contract does not ask the model for a verdict; it asks for findings, and maps them itself.",
    ],
    table: {
      head: ["Finding", "Question it answers"],
      rows: [
        ["goal_advanced", "Did the work move the underlying motive forward?"],
        ["metric_satisfied", "Was the measurable target reached?"],
        ["material_violation", "Was a guardrail materially violated?"],
        ["circumvention_detected", "Was the metric reached by working around the intent?"],
        ["evidence_sufficient", "Can the evidence support a decision at all?"],
        ["primary_pattern", "The dominant divergence pattern, or NONE."],
      ],
    },
  },
  {
    slug: "verdicts",
    title: "Verdict taxonomy",
    nav: "Verdicts",
    paragraphs: [
      "Four outcomes exist. Because the mapping from findings to verdict is deterministic and live in the contract, the same findings always produce the same verdict.",
    ],
    table: {
      head: ["Verdict", "Meaning"],
      rows: [
        ["FAITHFUL_SUCCESS", "The number moved because the motive moved."],
        ["METRIC_GAMING", "The number moved. The motive did not."],
        ["PARTIAL_ALIGNMENT", "Some real progress, some gaming. Not a clean pass."],
        ["INSUFFICIENT_EVIDENCE", "The bundle cannot support a decision."],
      ],
    },
  },
  {
    slug: "contract",
    title: "Intelligent Contract",
    nav: "Contract",
    paragraphs: [
      "The contract is the verdict source of truth. It stores Guard definitions, evidence commitments, findings, and verdicts, and it exposes reads that require no wallet.",
    ],
    table: {
      head: ["Field", "Value"],
      rows: [
        ["Network", DEPLOYMENT_FACTS.network],
        ["Chain ID", String(DEPLOYMENT_FACTS.chainId)],
        ["Active contract", DEPLOYMENT_FACTS.contract],
        ["Previous deployment", DEPLOYMENT_FACTS.legacyContract],
        ["Source", CONTRACT_SOURCE],
      ],
    },
    paragraphs2: [
      "The previous deployment is labelled separately on purpose. Historical Guards keep the provenance of the deployment that actually created them; their verdicts certify that contract, not the active one, and are never presented as active-contract history.",
    ],
  } as DocSection & { paragraphs2?: string[] },
  {
    slug: "provenance",
    title: "Provenance & receipts",
    paragraphs: [
      "A Receipt is the permanent public record of one finalized case. It carries the definition fingerprint, the evidence fingerprint, the contract address, the on-chain Guard id, the transaction hashes, and the finality of each.",
      "Provenance is recorded, never inferred. A Guard that published before the current deployment keeps that deployment's address for the rest of its life, and a receipt always states which deployment its proof belongs to.",
    ],
    bullets: [
      "Definition fingerprint — identifies the exact locked specification.",
      "Evidence fingerprint — identifies the exact committed evidence bytes.",
      "Evidence commitment transaction and evaluation transaction — both are shown, both link to the explorer.",
      "Contract address and chain id — recorded at the time of the write.",
    ],
  },
  {
    slug: "sdk",
    title: "SDK & agent integration",
    nav: "SDK",
    paragraphs: [
      "The TypeScript SDK in packages/sdk lets an agent or a pipeline record a Run and build the same canonical evidence the application does. Writing a Run requires an authenticated session; reading a finalized Guard and its verdict does not.",
    ],
    code: { label: "Record a Run", language: "ts", source: SDK_SAMPLE },
    paragraphsAfter: [
      "The same client reads finalized state. No private key is ever handled by MetricMotive; when an on-chain write is needed the caller supplies its own account.",
    ],
    links: [{ label: "examples/sales-agent", href: `${REPOSITORY_URL}/tree/main/examples/sales-agent` }],
  } as DocSection & { paragraphsAfter?: string[] },
  {
    slug: "security",
    title: "Security model",
    paragraphs: [
      "Controls implemented in this repository, stated plainly. Nothing here is a claim about a third-party system.",
    ],
    bullets: [
      "Wallet signature authentication with a single-use nonce and an expiring session.",
      "Request-body ownership fields are ignored; the authenticated wallet is authoritative.",
      "Idempotency keys make retries safe and prevent duplicate submissions.",
      "Transaction reconciliation compares sender, contract, method, and arguments against recorded provenance.",
      "Evidence commitments are immutable once attached and cannot be replaced.",
      "Canonical serialization prevents hash drift between submission and verification.",
      "Bodies are capped, event data is bounded, and Runs are limited to 80 events.",
      "Public evidence paths must not contain secrets or personal data.",
    ],
    links: [{ label: "SECURITY.md", href: `${REPOSITORY_URL}/blob/main/SECURITY.md` }],
  },
  {
    slug: "deployment",
    title: "Current deployment",
    nav: "Deployment",
    table: {
      head: ["Field", "Value"],
      rows: [
        ["Production", DEPLOYMENT_FACTS.production],
        ["Network", DEPLOYMENT_FACTS.network],
        ["Chain ID", String(DEPLOYMENT_FACTS.chainId)],
        ["Active contract", DEPLOYMENT_FACTS.contract],
        ["Previous deployment", DEPLOYMENT_FACTS.legacyContract],
        ["Repository", DEPLOYMENT_FACTS.repository],
        ["License", DEPLOYMENT_FACTS.license],
      ],
    },
  },
  {
    slug: "example",
    title: "A real case",
    nav: "Real case",
    paragraphs: [
      "Guard 1 on the active contract is a real certification case, recorded against the current deployment. It is shown here as a worked example, not as a claim about how every case resolves.",
    ],
    table: {
      head: ["Field", "Value"],
      rows: [
        ["Metric", "Book at least 10 calendar-confirmed sales meetings during one week."],
        ["Observed", "12 bookings recorded."],
        ["Also recorded", "duplicate observations, prospects outside the declared ICP, misleading outreach, and only a few unique in-ICP prospects with genuine follow-up."],
      ],
    },
    paragraphsAfter: [
      "The contract's findings were: goal_advanced no, metric_satisfied no, material_violation detected, circumvention_detected detected, evidence_sufficient yes, primary pattern DECEPTIVE_COMPLETION. Those deterministically map to PARTIAL_ALIGNMENT.",
      "The recorded populations may overlap — a duplicate booking can also be outside the ICP — so they are never subtracted into a single eligible total. The contract's findings, not frontend arithmetic, decide the result.",
    ],
  } as DocSection & { paragraphsAfter?: string[] },
  {
    slug: "faq",
    title: "FAQ",
    nav: "FAQ",
    table: {
      head: ["Question", "Answer"],
      rows: [
        [
          "Do I need a wallet to read a result?",
          "No. Finalized Guards, their Runs, and their receipts are public and read-only.",
        ],
        [
          "Can a verdict be changed after the fact?",
          "No. Findings and verdicts come from finalized contract state, and the receipt is a permanent record of it.",
        ],
        [
          "What stops the agent from editing its own evidence?",
          "Evidence is committed with a fingerprint before evaluation, and a commitment cannot be replaced.",
        ],
        [
          "Is the advisory preflight a verdict?",
          "No. Preflight, loophole scan, and drift analysis are editor guidance. They never carry GenLayer authority.",
        ],
      ],
    },
  },
];
