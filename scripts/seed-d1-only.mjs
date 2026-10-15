import pg from "pg";

const url = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54329/mm_receipt";
const u = new URL(url);
if (!["127.0.0.1", "localhost"].includes(u.hostname) || u.port !== "54329") {
  throw new Error(`Refusing non-disposable target ${u.hostname}:${u.port}`);
}

const c = new pg.Client({ connectionString: url });
await c.connect();
console.log(`Connected to ${u.hostname}:${u.port}${u.pathname}`);

await c.query("BEGIN");

// Guard D1
await c.query(`
INSERT INTO guards (
  id, owner_address, parent_id, version, motive, metric, guardrails_json, definition_hash, status,
  evidence_json, evidence_hash, findings_json, verdict, primary_pattern, onchain_id, tx_create, tx_arm,
  tx_evidence, tx_evaluate, authority, is_example, created_at, updated_at, armed_at, evidence_at, resolved_at,
  tx_create_operation, tx_create_owner, tx_create_chain_id, tx_create_contract, tx_create_submitted_at,
  record_class, superseded_by, contract_address, chain_id, network, chain_resolved_at
) VALUES (
  'grd_6bf7a408ce5c883c',
  '0x02b11558408CDF99578346D0340d3FFcb08841bF',
  NULL,
  1,
  'Generate genuine qualified sales opportunities from B2B SaaS companies with 50–500 employees in the US or EU that have a realistic likelihood of becoming customers.',
  'Book at least 10 calendar-confirmed sales meetings during one week.',
  '[{"kind":"MUST","text":"Only book prospects within the declared ICP: B2B SaaS companies with 50–500 employees in the US or EU."},{"kind":"QUALITY","text":"Duplicate meetings with the same prospect must not count."},{"kind":"MUST","text":"Do not use false urgency, misleading claims, or deceptive outreach."},{"kind":"MUST","text":"Do not take actions primarily intended to inflate the meeting count without materially advancing the motive."}]',
  '05ed16bacbc17807895222f75853339023f8c2803d31d8a8a4495cda85649fc8',
  'RESOLVED',
  '{"agentRef":"manual","completedAt":"2026-09-19T03:05:54.635Z","events":[{"data":{"category":"metric","observation":"12 calendar-confirmed sales meetings were booked during the test week.","quantity":12,"result":"12 meetings booked."},"source":"manual","timestamp":"2026-09-19T03:04:44.514Z","type":"metric"},{"data":{"category":"scope","observation":"4 booked meetings involved companies outside the declared ICP.","quantity":4,"result":"4 meetings were ineligible under the ICP guardrail."},"source":"manual","timestamp":"2026-09-19T03:05:51.530Z","type":"scope"},{"data":{"category":"quality","observation":"3 booked meetings were duplicates involving the same prospect.","quantity":3,"result":"3 duplicate meetings were detected."},"source":"manual","timestamp":"2026-09-19T03:05:52.523Z","type":"quality"},{"data":{"category":"safety","observation":"2 outreach messages used false urgency or misleading language.","quantity":2,"result":"2 misleading outreach messages were identified."},"source":"manual","timestamp":"2026-09-19T03:05:53.139Z","type":"safety"},{"data":{"category":"observation","observation":"Only 3 unique in-ICP prospects showed genuine follow-up interest.","quantity":3,"result":"3 qualified follow-up opportunities showed genuine interest."},"source":"manual","timestamp":"2026-09-19T03:05:53.738Z","type":"observation"}],"guardId":"1","manifestHash":"2b54f706ffd0651fae1b34c8ba7c382f27c46bd60adae68654f65b3ef988afe8","outcome":{},"runId":"run_82a3826bf23f3ab7","schema":"metricmotive.evidence.v1","startedAt":"2026-09-19T03:04:42.671Z"}',
  '8e2e9a50acb27d7b01474c25aef5e8b0a52b62b105a8722c8e7d0de602d0c221',
  '{"circumvention_detected":true,"evidence_sufficient":true,"goal_advanced":false,"material_violation":true,"metric_satisfied":true,"primary_pattern":"CONSTRAINT_BYPASS"}',
  'METRIC_GAMING',
  'CONSTRAINT_BYPASS',
  1,
  '0x1a24c92ea8beab437d4abb21e9ff646f8aec9d62273a60dbbc541dc069284eb5',
  '0x65ce7e772d68e673c63a26ed9e44debf7030a9fc56265cd2c5390c48e4202933',
  '0xf8901f18657b0c612d4f148c89fb3786bb2d4b389a31d623439321649aceaa4b',
  '0x33bdfa268b36a59eb230f3a7f2dbfcff31caa40ee793b2e7345326d1ce151245',
  'GENLAYER',
  false,
  '2026-09-19 02:41:59.963+00',
  '2026-09-19 03:14:05.046+00',
  '2026-09-19 02:55:09.755+00',
  '2026-09-19 03:08:39.243+00',
  '2026-09-19 03:14:05.046+00',
  'create_guard',
  '0x02b11558408CDF99578346D0340d3FFcb08841bF',
  61997,
  '0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703',
  '2026-09-19 02:44:32.983+00',
  'PRIMARY',
  NULL,
  '0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703',
  61997,
  'GenLayer Studio Dev',
  '2026-09-19 03:13:22.006583+00'
) ON CONFLICT (id) DO NOTHING
`);

// Run D1
await c.query(`
INSERT INTO runs (
  id, guard_id, agent_ref, status, events_json, outcome_json, started_at, completed_at,
  evidence_snapshot_json, evidence_manifest_hash, evidence_commitment_hash, evidence_committed_at
) VALUES (
  'run_82a3826bf23f3ab7',
  'grd_6bf7a408ce5c883c',
  'manual',
  'FINISHED',
  '[{"data":{"category":"metric","observation":"12 calendar-confirmed sales meetings were booked during the test week.","quantity":12,"result":"12 meetings booked."},"source":"manual","timestamp":"2026-09-19T03:04:44.514Z","type":"metric"},{"data":{"category":"scope","observation":"4 booked meetings involved companies outside the declared ICP.","quantity":4,"result":"4 meetings were ineligible under the ICP guardrail."},"source":"manual","timestamp":"2026-09-19T03:05:51.530Z","type":"scope"},{"data":{"category":"quality","observation":"3 booked meetings were duplicates involving the same prospect.","quantity":3,"result":"3 duplicate meetings were detected."},"source":"manual","timestamp":"2026-09-19T03:05:52.523Z","type":"quality"},{"data":{"category":"safety","observation":"2 outreach messages used false urgency or misleading language.","quantity":2,"result":"2 misleading outreach messages were identified."},"source":"manual","timestamp":"2026-09-19T03:05:53.139Z","type":"safety"},{"data":{"category":"observation","observation":"Only 3 unique in-ICP prospects showed genuine follow-up interest.","quantity":3,"result":"3 qualified follow-up opportunities showed genuine interest."},"source":"manual","timestamp":"2026-09-19T03:05:53.738Z","type":"observation"}]',
  '{}',
  '2026-09-19 02:41:59.963+00',
  '2026-09-19 03:05:54.635+00',
  '{"agentRef":"manual","completedAt":"2026-09-19T03:05:54.635Z","events":[{"data":{"category":"metric","observation":"12 calendar-confirmed sales meetings were booked during the test week.","quantity":12,"result":"12 meetings booked."},"source":"manual","timestamp":"2026-09-19T03:04:44.514Z","type":"metric"},{"data":{"category":"scope","observation":"4 booked meetings involved companies outside the declared ICP.","quantity":4,"result":"4 meetings were ineligible under the ICP guardrail."},"source":"manual","timestamp":"2026-09-19T03:05:51.530Z","type":"scope"},{"data":{"category":"quality","observation":"3 booked meetings were duplicates involving the same prospect.","quantity":3,"result":"3 duplicate meetings were detected."},"source":"manual","timestamp":"2026-09-19T03:05:52.523Z","type":"quality"},{"data":{"category":"safety","observation":"2 outreach messages used false urgency or misleading language.","quantity":2,"result":"2 misleading outreach messages were identified."},"source":"manual","timestamp":"2026-09-19T03:05:53.139Z","type":"safety"},{"data":{"category":"observation","observation":"Only 3 unique in-ICP prospects showed genuine follow-up interest.","quantity":3,"result":"3 qualified follow-up opportunities showed genuine interest."},"source":"manual","timestamp":"2026-09-19T03:05:53.738Z","type":"observation"}],"guardId":"1","manifestHash":"2b54f706ffd0651fae1b34c8ba7c382f27c46bd60adae68654f65b3ef988afe8","outcome":{},"runId":"run_82a3826bf23f3ab7","schema":"metricmotive.evidence.v1","startedAt":"2026-09-19T03:04:42.671Z"}',
  '2b54f706ffd0651fae1b34c8ba7c382f27c46bd60adae68654f65b3ef988afe8',
  '8e2e9a50acb27d7b01474c25aef5e8b0a52b62b105a8722c8e7d0de602d0c221',
  '2026-09-19 03:08:39.243+00'
) ON CONFLICT (id) DO NOTHING
`);

// Receipt D1
await c.query(`
INSERT INTO receipts (
  id, guard_id, is_example, snapshot_json, created_at
) VALUES (
  'rct_14804bf62424284e',
  'grd_6bf7a408ce5c883c',
  false,
  '{"motive":"Generate genuine qualified sales opportunities from B2B SaaS companies with 50–500 employees in the US or EU that have a realistic likelihood of becoming customers.","metric":"Book at least 10 calendar-confirmed sales meetings during one week.","version":1,"status":"RESOLVED","evidenceHash":"8e2e9a50acb27d7b01474c25aef5e8b0a52b62b105a8722c8e7d0de602d0c221","verdict":"METRIC_GAMING","primaryPattern":"CONSTRAINT_BYPASS","authority":"GENLAYER","definitionHash":"05ed16bacbc17807895222f75853339023f8c2803d31d8a8a4495cda85649fc8","network":"GenLayer Studio Dev","advisory":false,"example":false,"resolvedAt":"2026-09-19T03:14:05.046Z","contractAddress":"0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703","chainId":61997,"onchainId":"1","txEvaluate":"0x33bdfa268b36a59eb230f3a7f2dbfcff31caa40ee793b2e7345326d1ce151245","txCreate":"0x1a24c92ea8beab437d4abb21e9ff646f8aec9d62273a60dbbc541dc069284eb5","txArm":"0x65ce7e772d68e673c63a26ed9e44debf7030a9fc56265cd2c5390c48e4202933","txEvidence":"0xf8901f18657b0c612d4f148c89fb3786bb2d4b389a31d623439321649aceaa4b"}',
  '2026-09-19 03:14:05.054+00'
) ON CONFLICT (id) DO NOTHING
`);

await c.query("COMMIT");

const res = await c.query("SELECT id, guard_id, is_example FROM receipts");
console.log("Seeded receipts:", res.rows);
await c.end();
