// Seeds the captured public receipt into the DISPOSABLE QA Postgres only.
import fs from "node:fs";
import pg from "pg";
import { createHash } from "node:crypto";

const url = process.env.QA_DATABASE_URL;
if (!url) throw new Error("QA_DATABASE_URL required");
const u = new URL(url);
if (!["127.0.0.1", "localhost"].includes(u.hostname) || u.port !== "55432" || !u.pathname.slice(1).startsWith("mm_qa"))
  throw new Error(`Refusing non-disposable target ${u.hostname}:${u.port}${u.pathname}`);

// seroval subset: 0 number, 1 string, 2 constant, 9 array, 10/11 object
const dec = (n) => {
  switch (n.t) {
    case 0: case 1: return n.s;
    case 2: return [null, undefined, true, false][n.s];
    case 9: return n.a.map(dec);
    case 10: case 11: return Object.fromEntries(n.p.k.map((k, i) => [k, dec(n.p.v[i])]));
    default: throw new Error(`unknown seroval type ${n.t}`);
  }
};
const cap = JSON.parse(fs.readFileSync(process.argv[2] ?? "/tmp/claude-0/-root-MetricMotive/39e40e1e-c0bb-40cf-9f9d-9af35504ecc6/scratchpad/receipt-capture.json", "utf8"));
const { receipt, guard: g } = dec(JSON.parse(cap[0].body)).result;
// the capture double-escaped this string (\" instead of "); undo it, then check against the on-chain hash
if (g.evidenceJson.startsWith("{\\")) g.evidenceJson = g.evidenceJson.replace(/\\"/g, '"');
const ev = JSON.parse(g.evidenceJson);
console.log("evidence sha256 matches evidenceHash:", createHash("sha256").update(g.evidenceJson).digest("hex") === g.evidenceHash);

const c = new pg.Client({ connectionString: url });
await c.connect();
console.log(`target ${u.hostname}:${u.port}${u.pathname}`);
await c.query("begin");
await c.query(
  `insert into guards (id,owner_address,parent_id,version,motive,metric,guardrails_json,definition_hash,status,
    evidence_json,evidence_hash,findings_json,verdict,primary_pattern,onchain_id,contract_address,chain_id,network,
    tx_create,tx_create_operation,tx_create_owner,tx_create_chain_id,tx_create_contract,tx_create_submitted_at,
    tx_arm,tx_evidence,tx_evaluate,authority,is_example,record_class,superseded_by,created_at,updated_at,armed_at,evidence_at,resolved_at)
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36)
   on conflict (id) do nothing`,
  [g.id, g.ownerAddress, g.parentId, g.version, g.motive, g.metric, JSON.stringify(g.guardrails), g.definitionHash, g.status,
   g.evidenceJson, g.evidenceHash, JSON.stringify(g.findings), g.verdict, g.primaryPattern, g.onchainId, g.contractAddress, g.chainId, g.network,
   g.txCreate, g.txCreateOperation, g.txCreateOwner, g.txCreateChainId, g.txCreateContract, g.txCreateSubmittedAt,
   g.txArm, g.txEvidence, g.txEvaluate, g.authority, g.isExample, g.recordClass, g.supersededBy, g.createdAt, g.updatedAt, g.armedAt, g.evidenceAt, g.resolvedAt],
);
await c.query(
  `insert into runs (id,guard_id,agent_ref,status,events_json,outcome_json,started_at,completed_at,
    evidence_snapshot_json,evidence_manifest_hash,evidence_commitment_hash,evidence_committed_at)
   values ($1,$2,$3,'FINISHED',$4,$5,$6,$7,$8,$9,$10,$11) on conflict (id) do nothing`,
  [ev.runId, g.id, ev.agentRef, JSON.stringify(ev.events), JSON.stringify(ev.outcome), ev.startedAt, ev.completedAt,
   g.evidenceJson, ev.manifestHash, g.evidenceHash, g.evidenceAt],
);
await c.query(
  `insert into receipts (id,guard_id,is_example,snapshot_json,created_at) values ($1,$2,$3,$4,$5) on conflict (id) do nothing`,
  [receipt.id, receipt.guardId, receipt.isExample, JSON.stringify(receipt.snapshot), receipt.createdAt],
);
await c.query("commit");
const { rows } = await c.query(
  `select r.id rid, r.guard_id, r.snapshot_json, g.evidence_json, g.verdict, g.primary_pattern, g.is_example, g.authority
   from receipts r join guards g on g.id=r.guard_id where r.id=$1`, [receipt.id]);
const r = rows[0];
console.log({ receipt: r.rid, guard: r.guard_id, verdict: r.verdict, pattern: r.primary_pattern, authority: r.authority,
  isExample: r.is_example, snapshotVerdict: JSON.parse(r.snapshot_json).verdict, evidenceEvents: JSON.parse(r.evidence_json).events.length });
await c.end();
