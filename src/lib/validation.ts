import { z } from "zod";
import type {
  EvidenceManifest,
  Findings,
  Guardrail,
  JsonBag,
  LoopholeReport,
  PreflightReport,
  EvidenceBlueprint,
  DriftReport,
  RemediationPlan,
  RunEvent,
} from "./domain.ts";
import { LIMITS, GUARDRAIL_KINDS, PATTERNS } from "./domain.ts";
import { AppError } from "./errors.ts";

const primitive = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
export const jsonBagSchema = z
  .record(z.string().max(128), primitive)
  .refine((value) => Object.keys(value).length <= 64, "too many data fields")
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= LIMITS.eventData,
    "JSON data exceeds the event size limit",
  );

export const guardrailSchema = z.object({
  kind: z.enum(GUARDRAIL_KINDS),
  text: z.string().trim().min(1).max(LIMITS.guardrailText),
}).strict();

export const draftSchema = z.object({
  motive: z.string().trim().min(1).max(LIMITS.motive),
  metric: z.string().trim().min(1).max(LIMITS.metric),
  guardrails: z.array(guardrailSchema).max(LIMITS.guardrails),
  parentId: z.string().max(128).nullable().optional(),
}).strict();

export const runCreateSchema = z.object({
  guardId: z.string().trim().min(1).max(128),
  agentRef: z.string().trim().max(LIMITS.agentRef).optional(),
}).strict();

const isoDate = z.string().refine((value) => Number.isFinite(Date.parse(value)), "invalid timestamp");

export const runEventSchema = z.object({
  timestamp: isoDate.optional(),
  type: z.string().trim().min(1).max(64),
  source: z.string().trim().min(1).max(64),
  data: jsonBagSchema,
  artifactRef: z.string().trim().max(512).optional(),
}).strict();

export const eventRequestSchema = z.object({
  timestamp: isoDate.optional(),
  type: z.string().trim().min(1).max(64).optional(),
  source: z.string().trim().min(1).max(64).optional(),
  data: jsonBagSchema.optional(),
  artifactRef: z.string().trim().max(512).optional(),
}).strict();

export const runOutcomeSchema = jsonBagSchema;

export const hookEventSchema = eventRequestSchema.extend({
  runId: z.string().trim().min(1).max(128),
}).strict();

export const finishRequestSchema = z.object({
  outcome: runOutcomeSchema.optional(),
}).strict();

const idField = z.string().trim().min(1).max(128);

export const idRequestSchema = z.object({ id: idField }).strict();
export const runIdRequestSchema = z.object({ runId: idField }).strict();
export const updateDraftRequestSchema = draftSchema.extend({ id: idField }).strict();
export const addGuardrailRequestSchema = z.object({
  id: idField,
  guardrail: guardrailSchema,
}).strict();
export const runEventRequestSchema = z.object({
  runId: idField,
  event: runEventSchema,
}).strict();
export const runOutcomeRequestSchema = z.object({
  runId: idField,
  outcome: runOutcomeSchema.optional(),
}).strict();
export const guardRunRequestSchema = z.object({
  guardId: idField,
  runId: idField,
}).strict();
export const createV2RequestSchema = z.object({
  parentId: idField,
  motive: draftSchema.shape.motive,
  metric: draftSchema.shape.metric,
  guardrails: draftSchema.shape.guardrails,
}).strict();
export const confirmCreateRequestSchema = z.object({
  id: idField,
  onchainId: idField,
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
}).strict();
export const recordCreateSubmissionRequestSchema = z.object({
  id: idField,
  operation: z.literal("create_guard"),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  originatingWallet: z.string().trim().min(1).max(64),
  chainId: z.number().int(),
  contractAddress: z.string().trim().min(1).max(128),
  submittedAt: isoDate,
  reservationToken: z.string().trim().min(1).max(128).optional(),
}).strict();
export const createReservationRequestSchema = z.object({
  id: idField,
  reservationToken: z.string().trim().min(1).max(128),
}).strict();
export const confirmTxRequestSchema = z.object({
  id: idField,
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
}).strict();
export const confirmEvidenceRequestSchema = confirmTxRequestSchema.extend({
  encoded: z.string().min(1).max(LIMITS.evidence),
}).strict();
export const chainOperationSchema = z.enum([
  "create_guard",
  "update_draft",
  "arm_guard",
  "submit_evidence",
  "evaluate_guard",
  "create_version",
]);
export const recordTransactionRequestSchema = z.object({
  id: idField,
  operation: chainOperationSchema,
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  originatingWallet: z.string().trim().min(1).max(64),
  chainId: z.number().int(),
  contractAddress: z.string().trim().min(1).max(128),
  submittedAt: isoDate,
  expectedGuardId: idField.nullable().optional(),
  expectedEvidenceHash: z.string().trim().max(128).nullable().optional(),
  reservationToken: z.string().trim().min(1).max(128).optional(),
}).strict();
export const reconcileTransactionRequestSchema = z.object({
  id: idField,
  operation: chainOperationSchema,
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  reservationToken: z.string().trim().min(1).max(128).optional(),
}).strict();
export const actionAuditRequestSchema = z.object({
  actionName: z.string().trim().min(1).max(80),
  resourceId: z.string().trim().max(128).nullable().optional(),
  route: z.string().trim().min(1).max(256),
  idempotencyKey: z.string().trim().max(256).nullable().optional(),
  operationId: z.string().trim().max(128).nullable().optional(),
}).strict();
export const onchainIdRequestSchema = z.object({ onchainId: idField, contractAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).strict();
export const ownerRequestSchema = z.object({ owner: z.string().trim().min(1).max(64), contractAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional() }).strict();
export const walletNonceRequestSchema = z.object({ address: z.string().trim().min(1).max(64) }).strict();
export const walletVerifyRequestSchema = z.object({
  address: z.string().trim().min(1).max(64),
  nonce: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
}).strict();

export const chainGuardSchema = z.object({
  found: z.boolean(),
  id: z.union([z.string(), z.number()]).transform(String),
  owner: z.string().max(128),
  parent_id: z.union([z.string(), z.number(), z.null()]).transform((value) => value == null ? "" : String(value)).catch(""),
  version: z.coerce.number().int().nonnegative(),
  motive: z.string().max(LIMITS.motive),
  metric: z.string().max(LIMITS.metric),
  guardrails_json: z.string().max(12_000),
  definition_hash: z.string().max(128),
  status: z.string().max(64),
  evidence_json: z.string().max(LIMITS.evidence),
  evidence_hash: z.string().max(128),
  findings_json: z.string().max(12_000),
  verdict: z.string().max(64),
  primary_pattern: z.string().max(64),
  created_at: z.string().max(128),
  armed_at: z.string().max(128),
  evidence_at: z.string().max(128),
  resolved_at: z.string().max(128),
}).passthrough();

export const evidenceManifestSchema = z.object({
  schema: z.literal("metricmotive.evidence.v1"),
  guardId: z.string().min(1).max(128),
  runId: z.string().min(1).max(128),
  agentRef: z.string().max(LIMITS.agentRef),
  startedAt: isoDate,
  completedAt: isoDate,
  events: z.array(runEventSchema).max(LIMITS.events),
  outcome: runOutcomeSchema,
  manifestHash: z.string().regex(/^[0-9a-f]{64}$/i),
}).strict();

export const findingsSchema = z.object({
  goal_advanced: z.boolean(),
  metric_satisfied: z.boolean(),
  material_violation: z.boolean(),
  circumvention_detected: z.boolean(),
  evidence_sufficient: z.boolean(),
  primary_pattern: z.enum(PATTERNS),
}).strict();

export const preflightSchema = z.object({
  state: z.enum(["READY", "AMBIGUOUS", "GAMEABLE", "INCOMPLETE"]),
  issues: z.array(z.object({ title: z.string().max(300), detail: z.string().max(1000) }).strict()).max(20),
  recommendedGuardrails: z.array(guardrailSchema).max(LIMITS.guardrails),
  notes: z.string().max(2000),
  advisory: z.literal(true),
}).strict();

const loopholeSchema = z.object({
  pattern: z.enum(PATTERNS),
  title: z.string().max(300),
  description: z.string().max(2000),
  recommendedGuardrail: guardrailSchema,
}).strict();

export const loopholeReportSchema = z.object({
  loopholes: z.array(loopholeSchema).max(20),
  notes: z.string().max(2000),
  advisory: z.literal(true),
}).strict();

export const evidenceBlueprintSchema = z.object({
  required: z.array(z.string().max(500)).max(50),
  recommended: z.array(z.string().max(500)).max(50),
  external: z.array(z.string().max(500)).max(50),
  advisory: z.literal(true),
}).strict();

export const driftReportSchema = z.object({
  divergencePoint: z.string().max(500).nullable(),
  observations: z.array(z.object({ at: z.string().max(200), note: z.string().max(1000) }).strict()).max(LIMITS.events),
  notes: z.string().max(2000),
  advisory: z.literal(true),
}).strict();

export const remediationPlanSchema = z.object({
  improvedMetric: z.string().max(LIMITS.metric),
  improvedGuardrails: z.array(guardrailSchema).max(LIMITS.guardrails),
  evidenceRequirement: z.string().max(2000),
  notes: z.string().max(2000),
  advisory: z.literal(true),
}).strict();

export function parseInput<T>(schema: z.ZodType<T>, value: unknown, message = "Request validation failed"): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError("VALIDATION", message, 400);
  return result.data;
}

export function parseDraftInput(value: unknown) {
  return parseInput(draftSchema, value, "Guard definition is invalid");
}

export function parseRunCreate(value: unknown) {
  return parseInput(runCreateSchema, value, "Run request is invalid");
}

export function parseRunEvent(value: unknown): RunEvent {
  const parsed = parseInput(runEventSchema, value, "Run event is invalid");
  return {
    timestamp: parsed.timestamp ?? new Date().toISOString(),
    type: parsed.type,
    source: parsed.source,
    data: parsed.data,
    ...(parsed.artifactRef ? { artifactRef: parsed.artifactRef } : {}),
  };
}

export function parseOutcome(value: unknown): JsonBag {
  return parseInput(runOutcomeSchema, value, "Run outcome is invalid");
}

export function parseEvidence(value: unknown): EvidenceManifest {
  const parsed = parseInput(evidenceManifestSchema, value, "Evidence manifest is invalid");
  return {
    ...parsed,
    events: parsed.events.map((event) => parseRunEvent(event)),
  };
}

export function parseFindingsInput(value: unknown): Findings {
  return parseInput(findingsSchema, value, "Findings are invalid");
}

export function parseAdvisory<T extends PreflightReport | LoopholeReport | EvidenceBlueprint | DriftReport | RemediationPlan>(
  schema: z.ZodType<T>,
  value: unknown,
): T {
  return parseInput(schema, value, "Advisory analysis was invalid");
}

export type { Guardrail };
