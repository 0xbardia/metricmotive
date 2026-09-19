import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  buildEvidenceManifest,
  evidenceCommitmentHash,
  evidenceManifestPreimage,
  evidenceSnapshotOf,
  replayEvidenceSnapshot,
} from "./evidence.ts";
import { canonicalJson, canonicalize } from "../../packages/sdk/src/canonical.ts";
import { operationViewFromTx } from "./operations.ts";
import type { EvidenceManifest, RunRecord } from "./domain.ts";

const FIXTURE = JSON.parse(
  readFileSync("src/lib/__fixtures__/evidence-snapshot.fixture.json", "utf8"),
) as EvidenceManifest;

/** The real finalized transaction's manifest: 5 events, captured 2026-09-18. */
const SUBMITTED_MANIFEST_HASH = FIXTURE.manifestHash;
const SUBMITTED_COMMITMENT = "d478c67c448b25a946206d5d304298bf0747f2daaa3f3cf88b66fd6b440ee230";
/**
 * The legacy defect, recorded exactly: the manifest as submitted declared a
 * `manifestHash` computed over a Date-corrupted preimage, so it does NOT equal
 * the canonical hash of its own content. The full-manifest commitment the
 * contract stored (SUBMITTED_COMMITMENT) is still consistent with the bytes
 * that were submitted, which is why the transaction is recoverable.
 */
const CORRECT_INNER_HASH = "4337eb58002d69e06d6bc1fb321b06cf38824689540854c5cc1f9df65d5e7314";

/** The same Run as persisted: same content, plus the pinned snapshot columns. */
const { manifestHash: _declared, ...FIXTURE_RUN } = FIXTURE;

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    ...FIXTURE_RUN,
    id: FIXTURE.runId,
    guardId: "grd_6d6278eb29c57b18",
    status: "FINISHED",
    evidenceSnapshotJson: null,
    evidenceManifestHash: null,
    evidenceCommitmentHash: null,
    ...overrides,
  };
}

const source = (path: string) => readFileSync(path, "utf8");

describe("evidence snapshot canonicalization (root cause of the phantom mismatch)", () => {
  it("serializes a Date as its ISO string, never as an empty object", () => {
    const iso = "2026-09-18T00:30:22.338Z";
    assert.equal(canonicalJson(new Date(iso)), `"${iso}"`);
    assert.deepEqual(canonicalize(new Date(iso)), iso);
    // The defect: a Date has no own enumerable keys, so key-sorting dropped it
    // to "{}" and every digest derived from it was wrong.
    assert.notEqual(canonicalJson(new Date(iso)), "{}");
  });

  it("hashes a driver-returned Date identically to its ISO string", async () => {
    const asText = await buildEvidenceManifest({ guardId: "1", run: run() });
    const asDate = await buildEvidenceManifest({
      guardId: "1",
      run: run({
        startedAt: new Date("2026-09-18T00:30:22.338Z") as unknown as string,
        completedAt: new Date("2026-09-18T00:36:56.986Z") as unknown as string,
      }),
    });
    assert.equal(evidenceManifestPreimage(asDate), evidenceManifestPreimage(asText));
    assert.equal(asDate.manifestHash, asText.manifestHash);
    assert.equal(await evidenceCommitmentHash(asDate), await evidenceCommitmentHash(asText));
  });

  it("preserves the submitted Run's digests across a replay", async () => {
    // Pin the transaction's own bytes (what the operator recovery path does).
    const snapshot = await evidenceSnapshotOf(FIXTURE as EvidenceManifest);
    assert.equal(snapshot.manifestHash, SUBMITTED_MANIFEST_HASH);
    assert.equal(snapshot.commitmentHash, SUBMITTED_COMMITMENT);

    // Replay is byte-exact and hash-stable, so a refresh cannot drift.
    const replayed = await replayEvidenceSnapshot(snapshot.encoded);
    assert.equal(replayed.encoded, snapshot.encoded);
    assert.equal(replayed.manifestHash, SUBMITTED_MANIFEST_HASH);
    assert.equal(replayed.commitmentHash, SUBMITTED_COMMITMENT);
    assert.equal(replayed.manifest.events.length, 5);
  });

  it("keeps the inner hash and the full commitment in distinct domains", async () => {
    const rebuilt = await buildEvidenceManifest({ guardId: "1", run: run() });
    // inner = sha256(canonical(manifest minus manifestHash))
    assert.equal(rebuilt.manifestHash, CORRECT_INNER_HASH);
    // The contract commit is over the COMPLETE submitted manifest, which is the
    // only domain the contract stores.
    assert.equal(await evidenceCommitmentHash(FIXTURE as EvidenceManifest), SUBMITTED_COMMITMENT);
    assert.notEqual(rebuilt.manifestHash, SUBMITTED_COMMITMENT);
    // Regression: the submitted manifest's declared inner hash was the one
    // value the Date bug corrupted. It is quarantined to this legacy artifact
    // and can never be produced again.
    assert.notEqual(SUBMITTED_MANIFEST_HASH, CORRECT_INNER_HASH);
    assert.notEqual(SUBMITTED_MANIFEST_HASH, rebuilt.manifestHash);
  });

  it("is stable across re-reads and pinned against a reordered event list", async () => {
    const pinned = await buildEvidenceManifest({ guardId: "1", run: run() });
    // Array order is preserved (never sorted), so repeated generation of the
    // same Run cannot drift.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const again = await buildEvidenceManifest({ guardId: "1", run: run() });
      assert.equal(evidenceManifestPreimage(again), evidenceManifestPreimage(pinned));
    }
    // A different event ORDER is a different Run, and must not hash the same —
    // the old code let DB row order leak into the commitment.
    const reordered = await buildEvidenceManifest({
      guardId: "1",
      run: run({ events: [...FIXTURE.events].reverse() }),
    });
    assert.notEqual(evidenceManifestPreimage(pinned), evidenceManifestPreimage(reordered));
  });

  it("rejects a malformed snapshot instead of silently rebuilding one", async () => {
    await assert.rejects(() => replayEvidenceSnapshot("{ not json"), /not valid JSON/i);
    await assert.rejects(() => replayEvidenceSnapshot(JSON.stringify({ schema: "nope" })), /manifest/i);
  });
});

describe("immutable snapshot wiring (Finish Run / submit / reconcile)", () => {
  it("pins the snapshot exactly once, at Finish Run", () => {
    const repo = source("src/lib/server/repo.ts");
    assert.match(repo, /evidence_snapshot_json=\$3/);
    // Pinned under the same guard as the state transition, so it cannot be
    // rewritten by a later Finish Run attempt.
    assert.match(repo, /where id=\$6 and status='STARTED'/);
  });

  it("replays the pinned snapshot for submission and reconciliation", () => {
    const actions = source("src/lib/server/actions.ts");
    assert.match(actions, /ensureRunEvidenceSnapshot/);
    assert.doesNotMatch(actions, /buildEvidenceManifest\(\{ guardId: guard\.onchainId/);

    const reconciliation = source("src/lib/server/chain-reconciliation.ts");
    assert.match(reconciliation, /resolveRunEvidenceSnapshot\(run, submittedManifest\)/);
    // The old defect: rebuilding the manifest from mutable Run rows here.
    assert.doesNotMatch(reconciliation, /buildEvidenceManifest/);
  });

  it("recovers a pre-snapshot finalized transaction without a new chain write", () => {
    const repo = source("src/lib/server/repo.ts");
    const start = repo.indexOf("export async function resolveRunEvidenceSnapshot");
    const helper = repo.slice(start, repo.indexOf("export ", start + 10));
    // Legacy recovery pins the SUBMITTED bytes, only after proving equivalence.
    assert.match(helper, /evidenceManifestPreimage\(submitted\) !== evidenceManifestPreimage\(rebuilt\)/);
    assert.match(helper, /JSON\.stringify\(submitted\)/);
    // It never submits: no wallet, signer or contract-write surface may appear.
    assert.doesNotMatch(helper, /writeIntelligentContract|submit_evidence|privateKey|signer/i);
  });

  it("keeps a genuine mismatch a hard failure (no fuzzy matching)", () => {
    const repo = source("src/lib/server/repo.ts");
    assert.match(repo, /The submitted evidence does not match the persisted Run snapshot\./);
    for (const path of ["src/lib/server/repo.ts", "src/lib/server/chain-reconciliation.ts"]) {
      const text = source(path);
      assert.doesNotMatch(text, /levenshtein|fuzz|partialMatch|approximatelyEqual|\.includes\(submittedManifest/i);
    }
    const reconciliation = source("src/lib/server/chain-reconciliation.ts");
    assert.match(reconciliation, /MISMATCH/);
  });
});

describe("operation state machine (Phase 10 / 11)", () => {
  const base = { action: "submit_evidence", originAddress: "0x1", originChainId: 61999 };

  it("maps a submitted-but-unconfirmed transaction to a delayed, non-failed state", () => {
    const view = operationViewFromTx({
      ...base,
      phase: "confirming",
      hash: "0xabc",
      error: "Studionet confirmation timed out",
    });
    assert.ok(view);
    assert.equal(view.state, "confirmation_delayed");
    assert.equal(view.status, "Confirmation delayed");
    assert.equal(view.severity, "warning");
    assert.notEqual(view.state, "failed");
    assert.notEqual(view.status, "Needs attention");
    assert.ok(/could not confirm it yet/i.test(view.message));
    assert.ok(/No new transaction will be sent/i.test(view.message));
  });

  it("shows a single submitted state while confirmation is still pending", () => {
    const view = operationViewFromTx({ ...base, phase: "pending", hash: "0xabc", error: null });
    assert.ok(view);
    assert.equal(view.state, "submitted");
    assert.equal(view.title, "Evidence transaction submitted");
    assert.ok(!/did not complete/i.test(view.title));
    assert.ok(!/needs attention/i.test(view.status));
  });

  it("offers exactly one 'Check again' reconcile action and never a resubmit", () => {
    const view = operationViewFromTx({
      ...base,
      phase: "confirming",
      hash: "0xabc",
      error: "temporary",
    });
    assert.ok(view);
    assert.equal(view.retryMode, "reconcile");
    assert.equal(view.retryLabel, "Check again");
    assert.notEqual(view.retryLabel, "Retry confirmation");
  });

  it("has no retry control once the transaction is finalized", () => {
    const view = operationViewFromTx({ ...base, phase: "success", hash: "0xabc", error: null });
    assert.ok(view);
    assert.equal(view.state, "finalized");
    assert.equal(view.retryMode, "none");
    assert.equal(view.retryLabel, null);
  });

  it("never reports FAILED for a wallet rejection that submitted nothing", () => {
    const rejected = operationViewFromTx({ ...base, phase: "rejected", hash: null, error: null });
    assert.ok(rejected);
    assert.equal(rejected.retryMode, "none");
    // A rejection before submission is terminal-but-neutral, not a mismatch.
    assert.equal(rejected.state, "failed");
    assert.equal(rejected.txHash, null);
  });
});

describe("single status surface (Phase 11 / 12)", () => {
  it("renders exactly one status banner inside the evidence card", () => {
    const text = source("src/components/chain-actions.tsx");
    const submit = text.slice(text.indexOf("export function SubmitEvidenceChain"));
    const body = submit.slice(0, submit.indexOf("export function VerifyWithGenLayer"));
    const rendered = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.equal((rendered.match(/<TxStatusBanner/g) ?? []).length, 1);
    assert.equal((rendered.match(/<StatusBanner/g) ?? []).length, 0);
  });

  it("has exactly one reconciliation CTA and one 'Check again' label", () => {
    const operations = source("src/lib/operations.ts");
    // Exactly one place may produce a retry label, and it is a re-read label.
    assert.equal((operations.match(/retryLabel: isDelayed \? "Check again" : null/g) ?? []).length, 1);
    assert.doesNotMatch(operations, /Retry confirmation/);
    const text = source("src/components/chain-actions.tsx");
    const submit = text.slice(text.indexOf("export function SubmitEvidenceChain"));
    const body = submit.slice(0, submit.indexOf("export function VerifyWithGenLayer"));
    assert.equal((body.match(/reconcileOnce\(\)/g) ?? []).length, 1);
  });

  it("removes retry / needs-attention / commit-evidence copy from the committed Run state", () => {
    const card = source("src/components/ui/evidence-committed-card.tsx");
    // Strip comments: the file explains which controls it replaced.
    const rendered = card.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const banned of [/Retry confirmation/, /Needs attention/, /Commit evidence/, /confirmation delayed/i]) {
      assert.doesNotMatch(rendered, banned);
    }
    assert.match(rendered, /Finalized/);
    assert.match(rendered, /Evidence committed/);
    // Exactly one next action, and no reconciliation control at all.
    assert.equal((rendered.match(/<Button/g) ?? []).length, 1);
    assert.doesNotMatch(rendered, /reconcileOnce|Check again/);
  });

  it("renders exactly one finish action on an in-progress Run (C1)", () => {
    const text = source("src/routes/app/runs/$id.tsx");
    // Strip comments: the file explains which duplicate it replaced.
    const rendered = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const inProgress = rendered.slice(
      rendered.indexOf("function RunPageContent"),
      rendered.indexOf("function FinishedRunReview"),
    );
    // The in-progress branch used to offer the finish action twice: once in the
    // "Next action" card and again in a separate "When you are done" block. The
    // second copy now only exists for an EMPTY Run, so the two markers are
    // mutually exclusive rather than two live controls on the same screen.
    assert.equal((inProgress.match(/data-action="finish-run"/g) ?? []).length, 2);
    const emptyBranch = inProgress.slice(inProgress.indexOf("!run.events.length"));
    const emptyBranchBody = emptyBranch.slice(0, emptyBranch.indexOf(") : null}"));
    assert.match(emptyBranchBody, /data-action="finish-run"/);
  });

  it("keeps 5 submitted events as exactly 5 after hydration", async () => {
    const manifest = await buildEvidenceManifest({ guardId: "1", run: run() });
    const snapshot = await evidenceSnapshotOf(manifest);
    const replayed = await replayEvidenceSnapshot(snapshot.encoded);
    assert.equal(replayed.manifest.events.length, 5);
    assert.equal(new Set(replayed.manifest.events.map((event) => event.timestamp)).size, 5);
  });
});
