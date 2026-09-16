#!/usr/bin/env node
/** Explicit deployment seed for the two public certification examples and the
 * supporting coding case. Read routes never call this function. */
import pg from "pg";
import { EXAMPLE_GUARDS, EXAMPLE_RECEIPTS } from "../src/lib/examples.ts";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.log("[seed] DATABASE_URL not set — skipping official examples.");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const guard of EXAMPLE_GUARDS) {
    await client.query(
      `insert into guards (
        id, owner_address, parent_id, version, motive, metric, guardrails_json,
        definition_hash, status, evidence_json, evidence_hash, findings_json,
        verdict, primary_pattern, authority, is_example, created_at, updated_at,
        armed_at, evidence_at, resolved_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'LOCAL',true,now(),now(),now(),now(),now())
      on conflict (id) do nothing`,
      [
        guard.id,
        guard.ownerAddress,
        guard.parentId,
        guard.version,
        guard.motive,
        guard.metric,
        JSON.stringify(guard.guardrails),
        guard.definitionHash,
        guard.status,
        guard.evidenceJson,
        guard.evidenceHash,
        guard.findings ? JSON.stringify(guard.findings) : "",
        guard.verdict,
        guard.primaryPattern,
      ],
    );
  }
  for (const receipt of EXAMPLE_RECEIPTS) {
    await client.query(
      `insert into receipts (id, guard_id, is_example, snapshot_json) values ($1,$2,true,$3)
       on conflict (id) do nothing`,
      [receipt.id, receipt.guardId, JSON.stringify(receipt.snapshot)],
    );
  }
  await client.query("COMMIT");
  console.log("[seed] official examples are present.");
} catch (error) {
  await client.query("ROLLBACK");
  console.error("[seed] failed:", error?.message || error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
