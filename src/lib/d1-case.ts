/**
 * D1: the public case. Studio Dev Guard #1 on the active contract, METRIC_GAMING / CONSTRAINT_BYPASS.
 *
 * Every number the landing page and the demo show must come from this module
 * (which parses the verified on-chain snapshot), never from a literal in a component.
 * `node scripts/verify-d1.mjs` re-reads the chain (view calls only) and fails on any difference.
 * No-subtraction rule (cert-case.ts): the recorded populations may overlap, so they are shown
 * exactly as recorded and are never summed or subtracted into one eligible total.
 */
import { GUARD_1_SNAPSHOT } from "./d1/guard-1.snapshot.ts";

const g = GUARD_1_SNAPSHOT.guard;

type RawEvent = { type: string; source: string; timestamp: string; data: { category: string; observation: string; quantity: number; result: string } };
type Evidence = { agentRef: string; startedAt: string; completedAt: string; events: RawEvent[]; manifestHash: string; runId: string; schema: string };
type Findings = {
  circumvention_detected: boolean;
  evidence_sufficient: boolean;
  goal_advanced: boolean;
  material_violation: boolean;
  metric_satisfied: boolean;
  primary_pattern: string;
};

const evidence = JSON.parse(g.evidence_json) as Evidence;
const findings = JSON.parse(g.findings_json) as Findings;
const guardrails = JSON.parse(g.guardrails_json) as { kind: "MUST" | "QUALITY"; text: string }[];

const quantityOf = (category: string) => {
  const e = evidence.events.find((x) => x.data.category === category);
  if (!e) throw new Error(`D1 evidence has no ${category} event`);
  return e.data.quantity;
};

export const D1 = {
  contract: GUARD_1_SNAPSHOT.contract,
  chainId: 61997,
  network: "GenLayer Studio Dev",
  guardId: g.id,
  version: g.version,
  receiptId: "rct_14804bf62424284e",
  receiptPath: "/verify/rct_14804bf62424284e",
  explorerUrl: `https://explorer-studio-dev.genlayer.com/address/${GUARD_1_SNAPSHOT.contract}`,
  motive: g.motive,
  metric: g.metric,
  /** "Book at least 10 …" — parsed from the on-chain metric text. */
  metricTarget: Number(/at least (\d+)/i.exec(g.metric)?.[1]),
  guardrails,
  events: evidence.events,
  /** Recorded as captured. Overlapping populations: never summed or subtracted. */
  counts: {
    booked: quantityOf("metric"),
    outsideIcp: quantityOf("scope"),
    duplicates: quantityOf("quality"),
    misleading: quantityOf("safety"),
    qualifiedFollowUps: quantityOf("observation"),
    events: evidence.events.length,
  },
  findings,
  verdict: g.verdict,
  pattern: g.primary_pattern,
  hashes: { definition: g.definition_hash, evidence: g.evidence_hash, manifest: evidence.manifestHash },
  at: { created: g.created_at, locked: g.armed_at, evidence: g.evidence_at, resolved: g.resolved_at },
  runId: evidence.runId,
} as const;

/** Numbers that may legitimately appear in rendered case copy (traced by tests and the QA trace). */
export const D1_NUMBER_SOURCES: Record<string, string> = {
  [String(D1.counts.booked)]: "evidence event: metric.quantity",
  [String(D1.metricTarget)]: "on-chain metric text: 'at least N'",
  [String(D1.counts.outsideIcp)]: "evidence event: scope.quantity",
  [String(D1.counts.duplicates)]: "evidence event: quality.quantity",
  [String(D1.counts.misleading)]: "evidence event: safety.quantity",
  [String(D1.counts.qualifiedFollowUps)]: "evidence event: observation.quantity",
  [String(D1.counts.events)]: "evidence event count",
  "50": "on-chain guardrail text: ICP 50–500 employees",
  "500": "on-chain guardrail text: ICP 50–500 employees",
  [String(D1.chainId)]: "chain id",
  [String(D1.guardId)]: "on-chain guard id",
};
