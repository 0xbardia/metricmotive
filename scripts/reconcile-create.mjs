#!/usr/bin/env node
/**
 * One-time operator recovery for a submitted create_guard hash.
 *
 * This command never sends a transaction. It records the supplied hash as
 * provenance, verifies the transaction and returned Guard ID, re-reads that
 * exact Guard, and only then binds the local row.
 */
import pg from "pg";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { guardDeployment } from "../src/lib/contract.ts";
import { GENLAYER, parseGuardrails } from "../src/lib/domain.ts";
import {
  verifyCreateChainGuard,
  verifyCreateTransaction,
} from "../src/lib/reconciliation.ts";

const [guardId, txHash] = process.argv.slice(2);
if (!guardId || !txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
  console.error("usage: node --experimental-strip-types scripts/reconcile-create.mjs <local-guard-id> <create-tx-hash>");
  process.exit(2);
}
if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is required for production recovery");
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const normalizedHash = txHash.toLowerCase();
let deployment;

try {
  const found = await pool.query(
    `select id, owner_address, motive, metric, guardrails_json, definition_hash,
            status, onchain_id, contract_address, chain_id, tx_create, tx_create_operation, tx_create_owner,
            tx_create_chain_id, tx_create_contract, tx_create_submitted_at
            , is_example
       from guards where id=$1 limit 1`,
    [guardId],
  );
  const row = found.rows[0];
  if (!row) throw new Error("Local Guard was not found");
  deployment = guardDeployment({ contractAddress: row.contract_address, chainId: row.chain_id, txCreateContract: row.tx_create_contract, txCreateChainId: row.tx_create_chain_id, onchainId: row.onchain_id, txCreate: row.tx_create });
  if (row.is_example) throw new Error("Example Guards cannot be recovered");
  if (row.onchain_id) throw new Error("Local Guard is already bound; refusing to overwrite it");
  if (row.tx_create && row.tx_create.toLowerCase() !== normalizedHash) {
    throw new Error("Local Guard already has a different create transaction");
  }

  if (!row.tx_create) {
    await pool.query(
      `update guards set tx_create=$1, tx_create_operation=$2, tx_create_owner=$3,
              tx_create_chain_id=$4, tx_create_contract=$5, tx_create_submitted_at=$6,
              updated_at=now()
         where id=$7 and onchain_id is null and tx_create is null`,
      [
        txHash,
        "create_guard",
        row.owner_address,
        deployment.chainId,
        deployment.contractAddress,
        new Date().toISOString(),
        guardId,
      ],
    );
  }

  const local = {
    id: row.id,
    ownerAddress: row.owner_address,
    motive: row.motive,
    metric: row.metric,
    guardrails: parseGuardrails(row.guardrails_json || "[]"),
    definitionHash: row.definition_hash,
  };
  const client = createClient({ chain: studionet });
  const transaction = await client.getTransaction({ hash: txHash });
  const decoded = await verifyCreateTransaction(transaction, {
    ...local,
    txHash,
    contractAddress: deployment.contractAddress,
  });
  if (decoded.state !== "finalized") {
    console.log(JSON.stringify({ guardId, txHash, state: decoded.state, status: decoded.status }));
    process.exit(0);
  }

  const rawChain = await client.readContract({
    address: deployment.contractAddress,
    functionName: "get_guard",
    args: [Number(decoded.onchainId)],
  });
  const chain = await verifyCreateChainGuard(rawChain, local, decoded.onchainId);
  const updated = await pool.query(
    `update guards set onchain_id=$1, tx_create=coalesce(tx_create,$2), updated_at=now()
       where id=$3 and onchain_id is null and lower(tx_create)=lower($2)
       returning id`,
    [decoded.onchainId, txHash, guardId],
  );
  if (!updated.rows[0]) throw new Error("Local Guard changed before reconciliation completed");
  console.log(JSON.stringify({
    guardId,
    txHash,
    onchainId: decoded.onchainId,
    network: GENLAYER.network,
    status: chain.status,
    contract: deployment.contractAddress,
  }, null, 2));
} finally {
  await pool.end();
}
