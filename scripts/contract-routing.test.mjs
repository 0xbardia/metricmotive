import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";

test("persisted deployment routes RPC, reconciles colliding Guard IDs, and preserves receipts", async () => {
  const database = new PGlite();
  const sql = async (strings, ...values) => (await database.query(strings.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, ""), values)).rows;
  sql.query = async (text, values = []) => (await database.query(text, values)).rows;
  globalThis.__migrationTestSql = sql;
  const calls = [];
  let chainGuard;
  let transaction;
  globalThis.__migrationTestClient = {
    getChainId: async () => 61997,
    writeContract: async (request) => { calls.push(request); return `0x${"b".repeat(64)}`; },
    readContract: async (request) => { calls.push(request); return chainGuard; },
    getTransaction: async () => transaction,
    estimateTransactionFeesForWrite: async () => ({ distribution: { leaderTimeunitsAllocation: 100n }, feeValue: 1n }),
    request: async ({ method } = {}) => method === "eth_getBalance" ? "0xffffffffffffffff" : undefined,
    waitForFinalization: async () => ({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" }),
    waitForTransactionReceipt: async () => ({ statusName: "ACCEPTED", txExecutionResultName: "FINISHED_WITH_RETURN" }),
  };
  const server = await createServer({
    configFile: false,
    envDir: false,
    ssr: { noExternal: ["genlayer-js"] },
    server: { middlewareMode: true },
    appType: "custom",
    resolve: { alias: { "@": resolve("src") } },
    plugins: [{
      name: "isolated-contract-routing",
      enforce: "pre",
      resolveId(id) {
        if (id === "genlayer-js") return "\0test-genlayer";
        if (id.endsWith("/lib/db")) return "\0test-db";
      },
      load(id) {
        if (id === "\0test-genlayer") return "export const createClient = () => globalThis.__migrationTestClient;";
        if (id === "\0test-db") return "export const getSql = async () => globalThis.__migrationTestSql;";
      },
    }],
  });
  try {
    for (const file of (await readdir("migrations")).filter(name => /^\d.*\.sql$/.test(name)).sort()) {
      await database.exec(await readFile(`migrations/${file}`, "utf8"));
    }
    const { DEPLOYMENT, LEGACY_DEPLOYMENT } = await server.ssrLoadModule("/src/lib/contract.ts");
    const repo = await server.ssrLoadModule("/src/lib/server/repo.ts");
    const reads = await server.ssrLoadModule("/src/lib/server/chain-read.ts");
    const { writeIntelligentContract } = await server.ssrLoadModule("/src/lib/wallet/write.ts");
    const { reconcileTransaction } = await server.ssrLoadModule("/src/lib/server/chain-reconciliation.ts");
    const wallet = "0x61e26394c57c540C152f45f373f6C03a38674E2d";
    const rows = [
      { contractAddress: LEGACY_DEPLOYMENT.contractAddress, chainId: LEGACY_DEPLOYMENT.chainId },
      { contractAddress: DEPLOYMENT.contractAddress, chainId: DEPLOYMENT.chainId },
    ];
    const addresses = rows.map((row) => row.contractAddress);
    const guards = [];
    for (const [index, { contractAddress, chainId }] of rows.entries()) {
      const guard = await repo.insertGuard({ ownerAddress: wallet, parentId: null, version: 1, motive: "Genuine sales opportunities", metric: "Book 80 meetings", guardrails: [] });
      assert.equal(guard.contractAddress, DEPLOYMENT.contractAddress);
      await sql.query("update guards set contract_address=$1, chain_id=$2 where id=$3", [contractAddress, chainId, guard.id]);
      const hash = `0x${String(index + 1).repeat(64)}`;
      const reservation = await repo.reserveCreateGuard(guard.id, `claim-${index}`, wallet);
      assert.equal(reservation.canSubmit, true);
      await repo.recordChainTransaction(guard.id, { operation: "create_guard", txHash: hash, originatingWallet: wallet, chainId, contractAddress, submittedAt: new Date().toISOString(), reservationToken: `claim-${index}` }, wallet);
      transaction = { hash, sender: wallet, recipient: contractAddress, chainId, statusName: "FINALIZED", txDataDecoded: { callData: new Map([["method", "create_guard"], ["args", [guard.motive, guard.metric, "[]"]]]) }, consensus_data: { leader_receipt: [{ execution_result: "SUCCESS", result: { status: "return", payload: { readable: '"10"' } } }] } };
      chainGuard = { found: true, id: "10", owner: wallet, parent_id: "0", version: 1, motive: guard.motive, metric: guard.metric, guardrails_json: "[]", definition_hash: guard.definitionHash, status: "DRAFT", evidence_json: "", evidence_hash: "", findings_json: "", verdict: "NONE", primary_pattern: "NONE", created_at: "", armed_at: "", evidence_at: "", resolved_at: "" };
      const result = await reconcileTransaction(guard.id, "create_guard", wallet);
      assert.equal(result.state, "reconciled", result.message);
      assert.equal(result.guard.onchainId, "10");
      assert.equal(calls.at(-1).address, contractAddress);
      if (chainId === DEPLOYMENT.chainId) {
        for (const functionName of ["create_guard", "arm_guard", "submit_evidence", "evaluate_guard"]) {
          await assert.rejects(writeIntelligentContract({ account: wallet, connector: { getProvider: async () => ({ request: async ({ method } = {}) => method === "eth_chainId" ? "0xf22d" : undefined }) }, chainId, contractAddress, functionName, args: [], wait: "accepted", onHash: () => { throw new Error("captured mock submission"); } }), /captured mock/);
          assert.equal(calls.at(-1).address, contractAddress);
          assert.equal(calls.at(-1).functionName, functionName);
        }
      }
      await reads.readChainGuard("10", contractAddress);
      assert.equal(calls.at(-1).address, contractAddress);
      await assert.rejects(repo.recordChainTransaction(guard.id, { operation: "arm_guard", txHash: `0x${"a".repeat(64)}`, originatingWallet: wallet, chainId, contractAddress: addresses[1 - index], submittedAt: new Date().toISOString(), expectedGuardId: "10" }, wallet), /contract/i);
      await sql.query("update guards set status='RESOLVED', authority='GENLAYER', verdict='FAITHFUL_SUCCESS' where id=$1", [guard.id]);
      const receiptId = await repo.createReceipt(await repo.getGuard(guard.id));
      const receipt = await repo.getReceipt(receiptId);
      assert.equal(receipt.snapshot.contractAddress, contractAddress);
      assert.equal(receipt.snapshot.chainId, chainId);
      guards.push(await repo.getGuard(guard.id));
    }
    assert.equal(guards[0].onchainId, guards[1].onchainId);
    assert.notEqual(guards[0].contractAddress, guards[1].contractAddress);
    await reads.readOnChain("get_contract_info");
    assert.equal(calls.at(-1).address, DEPLOYMENT.contractAddress);
    await sql.query("update guard_transactions set contract_address=$1 where guard_id=$2", [addresses[1], guards[0].id]);
    await assert.rejects(reconcileTransaction(guards[0].id, "create_guard", wallet), /deployment/);

    const recoveredGuard = await repo.insertGuard({
      ownerAddress: wallet,
      parentId: null,
      version: 1,
      motive: "Recover the submitted operation",
      metric: "Keep one transaction identity",
      guardrails: [],
    });
    await sql.query("update guards set onchain_id=$1 where id=$2", ["11", recoveredGuard.id]);
    const armHash = `0x${"c".repeat(64)}`;
    transaction = {
      hash: armHash,
      sender: wallet,
      recipient: DEPLOYMENT.contractAddress,
      statusName: "FINALIZED",
      txDataDecoded: { callData: new Map([["method", "arm_guard"], ["args", [11]]]) },
      consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] },
    };
    chainGuard = { ...chainGuard, id: "11", owner: wallet, motive: recoveredGuard.motive, metric: recoveredGuard.metric, definition_hash: recoveredGuard.definitionHash, status: "ARMED" };
    const recovered = await reconcileTransaction(recoveredGuard.id, "arm_guard", wallet, { txHash: armHash });
    assert.equal(recovered.state, "reconciled");
    assert.equal(recovered.guard.status, "ARMED");
    assert.equal(recovered.guard.txArm, armHash);
    const repeated = await reconcileTransaction(recoveredGuard.id, "arm_guard", wallet, { txHash: armHash });
    assert.equal(repeated.state, "reconciled");
    const recoveredRows = await sql.query("select tx_hash, reconciled_at from guard_transactions where guard_id=$1 and operation='arm_guard'", [recoveredGuard.id]);
    assert.equal(recoveredRows.length, 1);
    assert.equal(recoveredRows[0].tx_hash, armHash);
    await assert.rejects(
      reconcileTransaction(recoveredGuard.id, "arm_guard", wallet, { txHash: `0x${"a".repeat(64)}` }),
      /different transaction|recorded operation/i,
    );
    assert.equal(calls.filter((call) => call.functionName === "writeContract").length, 0);

    const legacyGuard = await repo.insertGuard({
      ownerAddress: wallet,
      parentId: null,
      version: 1,
      motive: "Recover legacy provenance",
      metric: "Keep the operation recoverable",
      guardrails: [],
    });
    const legacyArmHash = `0x${"d".repeat(64)}`;
    await sql.query("update guards set onchain_id=$1, tx_arm=$2 where id=$3", ["12", legacyArmHash, legacyGuard.id]);
    transaction = {
      hash: legacyArmHash,
      sender: wallet,
      recipient: DEPLOYMENT.contractAddress,
      statusName: "FINALIZED",
      txDataDecoded: { callData: new Map([["method", "arm_guard"], ["args", [12]]]) },
      consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] },
    };
    chainGuard = { ...chainGuard, id: "12", owner: wallet, motive: legacyGuard.motive, metric: legacyGuard.metric, definition_hash: legacyGuard.definitionHash, status: "ARMED" };
    const legacyRecovered = await reconcileTransaction(legacyGuard.id, "arm_guard", wallet);
    assert.equal(legacyRecovered.state, "reconciled");
    assert.equal((await sql.query("select count(*)::int as n from guard_transactions where guard_id=$1 and operation='arm_guard'", [legacyGuard.id]))[0].n, 1);

    const concurrentGuard = await repo.insertGuard({
      ownerAddress: wallet,
      parentId: null,
      version: 1,
      motive: "Recover concurrently",
      metric: "Keep one ledger row",
      guardrails: [],
    });
    await sql.query("update guards set onchain_id=$1 where id=$2", ["15", concurrentGuard.id]);
    const concurrentHash = `0x${"b".repeat(64)}`;
    transaction = {
      hash: concurrentHash,
      sender: wallet,
      recipient: DEPLOYMENT.contractAddress,
      statusName: "FINALIZED",
      txDataDecoded: { callData: new Map([["method", "arm_guard"], ["args", [15]]]) },
      consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] },
    };
    chainGuard = { ...chainGuard, id: "15", owner: wallet, motive: concurrentGuard.motive, metric: concurrentGuard.metric, definition_hash: concurrentGuard.definitionHash, status: "ARMED" };
    const concurrent = await Promise.all([
      reconcileTransaction(concurrentGuard.id, "arm_guard", wallet, { txHash: concurrentHash }),
      reconcileTransaction(concurrentGuard.id, "arm_guard", wallet, { txHash: concurrentHash }),
    ]);
    assert.deepEqual(concurrent.map((result) => result.state), ["reconciled", "reconciled"]);
    assert.equal((await sql.query("select count(*)::int as n from guard_transactions where guard_id=$1 and operation='arm_guard'", [concurrentGuard.id]))[0].n, 1);

    const revertedGuard = await repo.insertGuard({
      ownerAddress: wallet,
      parentId: null,
      version: 1,
      motive: "Reject a reverted operation",
      metric: "Keep the local state unchanged",
      guardrails: [],
    });
    await sql.query("update guards set onchain_id=$1 where id=$2", ["13", revertedGuard.id]);
    const revertedHash = `0x${"e".repeat(64)}`;
    transaction = {
      hash: revertedHash,
      sender: wallet,
      recipient: DEPLOYMENT.contractAddress,
      statusName: "FINALIZED",
      txDataDecoded: { callData: new Map([["method", "arm_guard"], ["args", [13]]]) },
      consensus_data: { leader_receipt: [{ execution_result: "REVERTED" }] },
    };
    chainGuard = { ...chainGuard, id: "13", owner: wallet, motive: revertedGuard.motive, metric: revertedGuard.metric, definition_hash: revertedGuard.definitionHash, status: "DRAFT" };
    const reverted = await reconcileTransaction(revertedGuard.id, "arm_guard", wallet, { txHash: revertedHash });
    assert.equal(reverted.state, "mismatch");
    assert.equal((await repo.getGuard(revertedGuard.id)).status, "DRAFT");

    const unknownGuard = await repo.insertGuard({
      ownerAddress: wallet,
      parentId: null,
      version: 1,
      motive: "Reject an unknown operation",
      metric: "Never infer finality",
      guardrails: [],
    });
    await sql.query("update guards set onchain_id=$1 where id=$2", ["14", unknownGuard.id]);
    const unknownHash = `0x${"f".repeat(64)}`;
    transaction = null;
    const unknown = await reconcileTransaction(unknownGuard.id, "arm_guard", wallet, { txHash: unknownHash });
    assert.equal(unknown.state, "mismatch");
    assert.equal((await repo.getGuard(unknownGuard.id)).status, "DRAFT");
  } finally {
    await server.close();
    await database.close();
    delete globalThis.__migrationTestSql;
    delete globalThis.__migrationTestClient;
  }
});
