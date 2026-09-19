import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  CASE_LIFECYCLE,
  getGuardLifecyclePresentation,
  lockStateOf,
} from "./lifecycle.ts";
import { advance, canTransition, operationViewFromTx } from "./operations.ts";
import { humanReadableFindings, primaryPatternCopy } from "./findings.ts";
import {
  committedEvidenceLine,
  committedEvidenceLines,
  cleanLabel,
  evidenceEventSummary,
} from "./evidence-summary.ts";
import * as format from "./format.ts";
import { formatUtc } from "./format.ts";
import { explorerTxUrl, contractProvenanceLabel } from "./explorer.ts";
import { DEPLOYMENT_FACTS } from "./docs-content.ts";
import { buildEvidenceManifest, evidenceSnapshotOf } from "./evidence.ts";
import { replayEvidenceSnapshot } from "./evidence.ts";
import { CURRENT_CONTRACT } from "../../packages/sdk/src/deployment.ts";
import { LEGACY_CONTRACT_ADDRESS } from "../../packages/sdk/src/deployment.ts";
import type { RunEvent } from "./domain.ts";

/**
 * Read-only certification fixture for the completed production case.
 *
 * These assertions pin the golden case's identity and the derived presentation
 * of it. NOTHING here submits a transaction, connects a wallet, or writes to the
 * database: every value is either a constant transcribed from the final report
 * or derived by a pure function.
 */
const GOLDEN = {
  guardId: "grd_6d6278eb29c57b18",
  onchainId: "1",
  runId: "run_23d38577bc28cf7e",
  eventCount: 5,
  lockTx: "0x0560fc9ca162fb3e61cf84c03aee79989335ea84ec773d4926bcaff494737e0a",
  evidenceTx: "0xfbdef2727d475c9da6e471869e872c0fe346e8bf93a25a640235b2e559d54e87",
  evaluateTx: "0x5f20d57fbc452a24f7c6f3373606651223fd1e9a693f1bea655e9557af2aefee",
  verdict: "PARTIAL_ALIGNMENT",
  primaryPattern: "DECEPTIVE_COMPLETION",
  contract: "0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d",
} as const;

describe("golden case fixture is self-consistent", () => {
  it("pins the exact on-chain identity recorded in the final report", () => {
    assert.equal(GOLDEN.onchainId, "1");
    assert.equal(GOLDEN.eventCount, 5);
    assert.equal(GOLDEN.verdict, "PARTIAL_ALIGNMENT");
    assert.equal(GOLDEN.primaryPattern, "DECEPTIVE_COMPLETION");
    for (const hash of [GOLDEN.lockTx, GOLDEN.evidenceTx, GOLDEN.evaluateTx]) {
      assert.match(hash, /^0x[0-9a-f]{64}$/);
    }
    assert.equal(GOLDEN.contract, "0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d");
    assert.notEqual(GOLDEN.contract, CURRENT_CONTRACT.contractAddress);
  });

  it("routes golden Studionet hashes to the historical explorer", () => {
    for (const hash of [GOLDEN.lockTx, GOLDEN.evidenceTx, GOLDEN.evaluateTx]) {
      assert.equal(
        explorerTxUrl(hash, { chainId: 61999, contractAddress: GOLDEN.contract }),
        `https://explorer-studio.genlayer.com/tx/${hash}`,
      );
    }
  });

  it("keeps the active and legacy deployments distinct", () => {
    assert.equal(contractProvenanceLabel(CURRENT_CONTRACT.contractAddress), "active");
    assert.equal(contractProvenanceLabel(LEGACY_CONTRACT_ADDRESS), "legacy");
    assert.notEqual(
      GOLDEN.contract.toLowerCase(),
      LEGACY_CONTRACT_ADDRESS.toLowerCase(),
      "the golden case lives on the previous Studionet contract, not the older legacy one",
    );
  });

  it("presents the finalized findings in human form, not as raw keys", () => {
    const findings = {
      goal_advanced: false,
      metric_satisfied: false,
      material_violation: true,
      circumvention_detected: true,
      evidence_sufficient: true,
      primary_pattern: GOLDEN.primaryPattern,
    } as const;
    const rows = humanReadableFindings(findings);
    assert.deepEqual(
      rows.map((row) => [row.label, row.value]),
      [
        ["Motive advanced", "No"],
        ["Metric target reached", "No"],
        ["Material guardrail violation", "Detected"],
        ["Circumvention", "Detected"],
        ["Evidence sufficient", "Yes"],
      ],
    );
    assert.equal(primaryPatternCopy(GOLDEN.primaryPattern), "Deceptive completion");
  });

  it("shows a resolved case with every lifecycle step complete (N28)", () => {
    const presentation = getGuardLifecyclePresentation({
      guardStatus: "RESOLVED",
      authority: "GENLAYER",
      published: true,
      lockRecorded: true,
      verdict: "PARTIAL_ALIGNMENT",
      evidenceCommitted: true,
      hasReceipt: true,
    });
    assert.equal(presentation.isResolved, true);
    assert.equal(presentation.stepStates.length, CASE_LIFECYCLE.steps.length);
    assert.deepEqual(presentation.stepStates, ["complete", "complete", "complete", "complete"]);
    assert.equal(
      presentation.stepStates.indexOf("current"),
      -1,
      "a resolved case must not advertise a current action step",
    );
    assert.equal(presentation.protocolLabel, "RESOLVED");
  });

  it("never reports LOCKED before the lock transaction is recorded (N1 / N10)", () => {
    assert.equal(lockStateOf("DRAFT", false, false), "READY_TO_LOCK");
    assert.equal(lockStateOf("DRAFT", true, false), "PUBLISHED_NOT_LOCKED");
    assert.equal(lockStateOf("LOCKED", true, true), "LOCKED");
  });

  it("reports verification in progress rather than a stale next step (N25)", () => {
    const verifying = getGuardLifecyclePresentation({
      guardStatus: "EVIDENCE_SUBMITTED",
      authority: "GENLAYER",
      lockRecorded: true,
      evidenceCommitted: true,
      verificationRequested: true,
    });
    assert.equal(verifying.protocolLabel, "VERIFYING");
    assert.equal(verifying.headline, "Verification in progress.");
  });
});

describe("operation state machine invariants", () => {
  const base = { action: "evaluate_guard", originAddress: "0x1", originChainId: 61999 };

  it("never renders SUBMITTED and FAILED for the same operation", () => {
    // A recorded hash with an unreadable finality is DELAYED, never failed.
    const delayed = operationViewFromTx({
      ...base,
      phase: "confirming",
      hash: GOLDEN.evaluateTx,
      error: "RPC timeout",
    });
    assert.equal(delayed?.state, "confirmation_delayed");
    assert.notEqual(delayed?.state, "failed");
    assert.equal(delayed?.title, "Confirmation delayed");
    assert.doesNotMatch(delayed?.title ?? "", /did not complete/i);
  });

  it("never coexists a CONFIRMING state and a DELAYED card", () => {
    const view = operationViewFromTx({
      ...base,
      phase: "confirming",
      hash: GOLDEN.evaluateTx,
      error: null,
    });
    // Confirming is one state with one status, so the two cannot both render.
    assert.equal(view?.state, "confirming");
    assert.equal(view?.status, "Confirming");
    assert.notEqual(view?.status, "Confirmation delayed");
  });

  it("removes retry controls once the transaction is finalized", () => {
    const view = operationViewFromTx({
      ...base,
      phase: "success",
      hash: GOLDEN.evaluateTx,
      error: null,
    });
    assert.equal(view?.state, "finalized");
    assert.equal(view?.retryMode, "none");
    assert.equal(view?.retryLabel, null);
  });

  it("Check again only re-reads, and is never a resubmit", () => {
    const view = operationViewFromTx({
      ...base,
      phase: "confirming",
      hash: GOLDEN.evaluateTx,
      error: "timeout",
    });
    assert.equal(view?.retryLabel, "Check again");
    assert.equal(view?.retryMode, "reconcile");
    assert.match(view?.diagnostic ?? "", /No new transaction will be submitted/i);
  });

  it("keeps transitions monotonic so a stale response cannot regress state", () => {
    assert.equal(advance("confirmation_delayed", "submitted"), "confirmation_delayed");
    assert.equal(advance("confirmation_delayed", "confirming"), "confirmation_delayed");
    assert.equal(advance("finalized", "confirming"), "finalized");
    assert.equal(advance("submitted", "finalized"), "finalized");
    assert.equal(advance("submitted", "confirmation_delayed"), "confirmation_delayed");
    assert.equal(canTransition("finalized", "submitted"), false);
  });
});

describe("receipt evidence summary (N29)", () => {
  const run = JSON.parse(
    readFileSync("src/lib/__fixtures__/evidence-snapshot.fixture.json", "utf8"),
  ) as { runId: string; events: RunEvent[] };

  it("is the golden Run with exactly five committed events", () => {
    assert.equal(run.runId, GOLDEN.runId);
    assert.equal(run.events.length, GOLDEN.eventCount);
  });

  it("transcribes recorded quantities without inventing an eligible total", () => {
    const lines = committedEvidenceLines(run.events);
    assert.equal(lines.length, 5);
    assert.deepEqual(
      lines.map((line) => line.quantity),
      [12, 3, 4, 2, 3],
    );
    // The populations may overlap, so no line is a subtraction of the others.
    assert.ok(!lines.some((line) => line.quantity === 12 - 3 - 4));
  });

  it("does not repeat a quantity the recorded wording already opens with", async () => {
    const receipt = readFileSync("src/routes/verify/$receiptId.tsx", "utf8");
    assert.match(receipt, /startsWithQuantity\(line\.label, line\.quantity\)/);
  });

  it("strips recording prefixes but preserves the recorded wording", () => {
    const lines = committedEvidenceLines(run.events);
    for (const line of lines) {
      assert.ok(line.label.length > 10);
      assert.doesNotMatch(line.label, /^(?:action\s*\/\s*observation|observation|result|notes)\s*:/i);
    }
    assert.match(lines[0].label, /12 calendar-confirmed sales meetings/i);
    assert.equal(cleanLabel("Result: something happened."), "something happened");
  });

  it("describes an event identically wherever it is listed (H7)", () => {
    // The Run list and the Receipt render the same recorded event; before this
    // they differed by a raw "Action / observation:" prefix, so one surface
    // showed recorder plumbing the other had cleaned away.
    for (const event of run.events) {
      const summary = evidenceEventSummary(event);
      assert.doesNotMatch(summary, /^(?:action\s*\/\s*observation|observation|result|notes)\s*:/i);
      assert.equal(summary, committedEvidenceLine(event).label);
    }
  });
});

describe("receipt timestamps name their zone (N33)", () => {
  it("always renders an explicit UTC suffix", () => {
    const formatted = formatUtc("2026-09-18T03:58:00.665960Z");
    assert.match(formatted, /UTC$/);
    assert.match(formatted, /Sep 18, 2026/);
  });

  it("returns a placeholder rather than an invalid date", () => {
    assert.equal(formatUtc(null), "—");
    assert.equal(formatUtc("not-a-date"), "not-a-date");
  });

  it("exposes no zoneless date formatter for a caller to reach for (N33)", () => {
    // The fix is the removal, not a convention: if a formatter that omits the
    // zone is re-added, some surface will silently render the viewer's clock
    // and this fails before that reaches production.
    assert.ok(!("formatDate" in format), "format.ts must not export a zoneless formatDate");
    const sources = [
      readFileSync("src/routes/app/guards/$id.tsx", "utf8"),
      readFileSync("src/routes/verify/$receiptId.tsx", "utf8"),
      readFileSync("src/routes/app/runs/$id.tsx", "utf8"),
    ].join("\n");
    assert.doesNotMatch(sources, /formatDate\b/, "routes must use the UTC formatter");
  });
});

describe("documentation metadata matches the running deployment", () => {
  it("states the active contract, chain, and license truthfully", () => {
    assert.equal(DEPLOYMENT_FACTS.contract, CURRENT_CONTRACT.contractAddress);
    assert.equal(DEPLOYMENT_FACTS.chainId, CURRENT_CONTRACT.chainId);
    assert.equal(DEPLOYMENT_FACTS.network, CURRENT_CONTRACT.network);
    assert.equal(DEPLOYMENT_FACTS.license, "Apache-2.0");
    assert.match(readFileSync("LICENSE", "utf8"), /Apache License/);
  });

  it("imports its deployment values instead of hard-coding them", () => {
    const source = readFileSync("src/lib/docs-content.ts", "utf8");
    assert.match(source, /CURRENT_CONTRACT/);
    assert.match(source, /LEGACY_DEPLOYMENT/);
    assert.doesNotMatch(
      source,
      /0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d/,
      "the active contract address must come from deployment.ts, not a literal",
    );
  });

  it("documents only SDK exports that exist", () => {
    const client = readFileSync("packages/sdk/src/client.ts", "utf8");
    for (const method of ["startRun", "recordEvent", "completeRun", "getGuard", "getVerdict"]) {
      assert.match(client, new RegExp(`async ${method}\\(`), `SDK must export ${method}`);
    }
    const index = readFileSync("packages/sdk/src/index.ts", "utf8");
    assert.match(index, /MetricMotiveClient/);
    assert.match(index, /eventOf/);
  });
});


describe("finished Run snapshot reconciles with zero new writes (N23)", () => {
  const GOLDEN_COMMITMENT = "d478c67c448b25a946206d5d304298bf0747f2daaa3f3cf88b66fd6b440ee230";

  it("re-derives the exact on-chain commitment from the pinned bytes", async () => {
    // The contract stored this commitment and the verdict was computed against
    // it. If it cannot be reproduced from the persisted snapshot, reconciliation
    // would need a chain write — which is precisely what must never happen.
    const snapshot = JSON.parse(
      readFileSync("src/lib/__fixtures__/evidence-snapshot.fixture.json", "utf8"),
    );
    const replayed = await replayEvidenceSnapshot(JSON.stringify(snapshot));
    assert.equal(replayed.commitmentHash, GOLDEN_COMMITMENT);
    // Replay is byte-stable: re-encoding the parsed manifest is idempotent.
    const again = await replayEvidenceSnapshot(replayed.encoded);
    assert.equal(again.encoded, replayed.encoded);
  });

  it("keeps every freshly built manifest self-consistent", async () => {
    // A manifest built TODAY must satisfy both hash domains, so a new case can
    // never inherit the historical inner-hash drift.
    const snapshot = JSON.parse(
      readFileSync("src/lib/__fixtures__/evidence-snapshot.fixture.json", "utf8"),
    ) as { guardId: string; runId: string; agentRef: string; events: RunEvent[]; outcome: object };
    const manifest = await buildEvidenceManifest({
      guardId: snapshot.guardId,
      run: {
        id: snapshot.runId,
        agentRef: snapshot.agentRef,
        startedAt: "2026-09-18T00:30:22.338Z",
        completedAt: "2026-09-18T00:36:56.986Z",
        events: snapshot.events,
        outcome: snapshot.outcome as never,
      },
    });
    const fresh = await evidenceSnapshotOf(manifest);
    // The inner digest must be reproducible from its own preimage.
    const replay = await replayEvidenceSnapshot(JSON.stringify(manifest));
    assert.equal(replay.manifestHash, manifest.manifestHash);
    assert.equal(fresh.manifestHash, manifest.manifestHash);
  });

  it("does not re-derive evidence from mutable Run rows", async () => {
    const source = readFileSync("src/lib/server/repo.ts", "utf8");
    // The snapshot is read back verbatim, never rebuilt from run columns.
    assert.match(source, /replayEvidenceSnapshot\(run\.evidenceSnapshotJson\)/);
    const evidence = readFileSync("src/lib/evidence.ts", "utf8");
    assert.match(evidence, /Replay a persisted snapshot verbatim/);
  });
});
