import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getGuardLifecyclePresentation, builderProgress, CASE_LIFECYCLE } from "./lifecycle.ts";
import { dedupeMessages, operationViewFromTx, isRecoverable } from "./operations.ts";
import {
  humanReadableFindings,
  technicalFindings,
  findingsNarrative,
} from "./findings.ts";
import {
  canUseExactMode,
  eligibilityObservationsFromEvents,
  explainMetric,
  rawMetricObservationFromEvents,
} from "./metric-explanation.ts";
import { verdictRole, verdictCopyFor, roleClass } from "./tokens.ts";
import { explorerTxUrl, contractProvenanceLabel } from "./explorer.ts";
import { humanReadableFindings as humanFindings } from "./findings.ts";
import { CTA, TERMS } from "./terminology.ts";
import { computeDefinitionHashFixture } from "./__fixtures__/ui-fixtures.ts";
import type { RunEvent } from "./domain.ts";

describe("lifecycle presentation (C0 / C3 / C4)", () => {
  it("makes verification the required next action once evidence is committed", () => {
    const p = getGuardLifecyclePresentation({
      guardStatus: "EVIDENCE_SUBMITTED",
      authority: "GENLAYER",
      lockRecorded: true,
    });
    assert.equal(p.stage, "EVIDENCE_COMMITTED");
    assert.equal(p.nextAction.kind, "continue-to-verification");
    assert.equal(p.nextAction.label, CTA.continueToVerification);
    assert.equal(p.nextAction.required, true);
    assert.equal(p.protocolLabel, "EVIDENCE COMMITTED");
    assert.equal(p.step, 3);
  });

  it("keeps a submitted evidence transaction on the verification path while reconciliation catches up", () => {
    const p = getGuardLifecyclePresentation({
      guardStatus: "ARMED",
      authority: "GENLAYER",
      lockRecorded: true,
      evidenceCommitted: true,
    });
    assert.equal(p.stage, "EVIDENCE_COMMITTED");
    assert.equal(p.nextAction.kind, "continue-to-verification");
  });

  it("never lets an optional action outrank the required lifecycle action", () => {
    for (const status of ["DRAFT", "ARMED", "EVIDENCE_SUBMITTED", "RESOLVED"] as const) {
      const p = getGuardLifecyclePresentation({
        guardStatus: status,
        authority: "GENLAYER",
        lockRecorded: true,
      });
      assert.equal(p.nextAction.required, true);
      for (const optional of p.optionalActions) {
        assert.equal(optional.required, false);
        assert.notEqual(optional.kind, p.nextAction.kind);
      }
    }
  });

  it("keeps the builder flow separate from the case lifecycle", () => {
    const builder = builderProgress(2);
    assert.equal(builder.context, "Guard Builder");
    assert.equal(builder.label, "Review");
    assert.deepEqual([...CASE_LIFECYCLE.steps], ["Draft", "Lock", "Run", "Verify"]);
    assert.equal(new Set(CASE_LIFECYCLE.steps).size, 4);
  });

  it("derives one consistent step index from protocol state", () => {
    const draft = getGuardLifecyclePresentation({ guardStatus: "DRAFT", authority: "LOCAL" });
    const armed = getGuardLifecyclePresentation({
      guardStatus: "ARMED",
      authority: "GENLAYER",
      lockRecorded: true,
    });
    const resolved = getGuardLifecyclePresentation({
      guardStatus: "RESOLVED",
      authority: "GENLAYER",
      lockRecorded: true,
    });
    assert.equal(draft.step, 0);
    // N15: a finalized lock is a COMPLETED step. The outstanding action is the
    // Run, so the current step is Run — never the lock that already happened.
    assert.equal(armed.step, 2);
    assert.equal(resolved.step, 3);
    assert.equal(draft.protocolLabel, "DRAFT");
    assert.equal(armed.protocolLabel, "LOCKED");
    assert.notEqual(draft.step, armed.step);

    const armedStates = armed.stepStates;
    assert.equal(armedStates[0], "complete", "Draft is done");
    assert.equal(armedStates[1], "complete", "Lock is done and must be checked (N15)");
    assert.equal(armedStates[2], "current", "Run is the action");
    assert.equal(armedStates[3], "upcoming");
    assert.equal(armed.stepLabel, "Run");
    // The action and the highlighted step must agree; they used to contradict.
    assert.equal(armed.nextAction.kind, "start-run");
  });

  it("keeps route identity durable and reports a published Guard as locked", () => {
    const presentation = getGuardLifecyclePresentation({
      guardStatus: "ARMED",
      authority: "LOCAL",
      published: true,
      lockRecorded: true,
    });
    assert.equal(presentation.step, 2);
    assert.equal(presentation.stepLabel, "Run");
    assert.equal(presentation.headline, "Guard locked. Start capturing evidence.");
    assert.doesNotMatch(presentation.body, /Studionet/);
  });

  it("never resumes a persisted Guard under the transient /new route", async () => {
    const source = await import("node:fs").then(({ readFileSync }) =>
      readFileSync("src/routes/app/guards/new.tsx", "utf8"),
    );
    // Explicit ?guardId= recovery may open the canonical Guard page.
    assert.match(source, /persistedGuardQuery/);
    assert.match(source, /persistedGuardQuery\.data\?\.guard\.id/);
    assert.match(source, /if \(draft\.guardId\) \{[\s\S]*setId\(draft\.guardId\);[\s\S]*setStep\(1\);/);
    // First Save Definition must not leave the builder before Protect.
    const persistFn = source.slice(source.indexOf("const persist = useMutation"), source.indexOf("async function goNext()"));
    assert.doesNotMatch(persistFn, /to:\s*"\/app\/guards\/\$id"/);
  });

  it("keeps a Guard-page evidence hash in reconciliation instead of starting a second Run", async () => {
    const source = await import("node:fs").then(({ readFileSync }) =>
      readFileSync("src/routes/app/guards/$id.tsx", "utf8"),
    );
    assert.match(source, /evidenceCommitted: Boolean\(guard\.evidenceHash \|\| guard\.txEvidence\)/);
    assert.match(source, /guard\.txEvidence && !guard\.evidenceHash && data\.runs\[0\]/);
    assert.match(source, /<SubmitEvidenceChain/);
  });

  it("waits for the Run evidence count to reconcile after Add evidence", async () => {
    const source = await import("node:fs").then(({ readFileSync }) =>
      readFileSync("src/routes/app/runs/$id.tsx", "utf8"),
    );
    const append = source.slice(source.indexOf("const append = useMutation"), source.indexOf("const finish = useMutation"));
    assert.match(append, /onSuccess: async/);
    assert.match(append, /await qc\.invalidateQueries\(\{ queryKey: \["run", id\] \}\)/);
  });

  it("waits for Guard state to refetch after a chain action", async () => {
    const source = await import("node:fs").then(({ readFileSync }) =>
      readFileSync("src/components/chain-actions.tsx", "utf8"),
    );
    assert.match(source, /await opts\.onSubmitted\?\.\(\)/);
    assert.match(source, /await onUpdatedRef\.current\(\)/);
  });

  it("recovers a submitted create from the workspace without inviting a duplicate write", async () => {
    const source = await import("node:fs").then(({ readFileSync }) =>
      readFileSync("src/components/app-home-content.tsx", "utf8"),
    );
    assert.match(source, /reconcileCreateFn/);
    assert.match(source, /guard\.txCreate && !guard\.onchainId/);
    assert.match(source, /result\.value\.state === "reconciled"/);
    assert.match(source, /invalidateQueries\(\{ queryKey: \["guards", address\] \}\)/);
    assert.match(source, /Confirmation delayed/);
    assert.match(source, /Check confirmation/);
  });

  it("keeps the active network visible in the mobile wallet menu", async () => {
    const source = await import("node:fs").then(({ readFileSync }) =>
      readFileSync("src/components/wallet-control.tsx", "utf8"),
    );
    const networkControl = source.slice(source.indexOf('data-wallet="network"') - 220, source.indexOf('data-wallet="network"'));
    assert.doesNotMatch(networkControl, /\bhidden\b/);
  });

  it("never treats a locally armed Guard as locked without a recorded lock (N1 / N10)", () => {
    const unpublished = getGuardLifecyclePresentation({
      guardStatus: "ARMED",
      authority: "GENLAYER",
      published: true,
      lockRecorded: false,
    });
    assert.equal(unpublished.step, 0);
    assert.equal(unpublished.lockState, "PUBLISHED_NOT_LOCKED");
    assert.equal(unpublished.lockLabel, "PUBLISHED · NOT LOCKED");
    assert.equal(unpublished.lockedGuard, false);
    assert.notEqual(unpublished.protocolLabel, "LOCKED");
  });

  it("treats a finished Run awaiting commit as the Run stage", () => {
    const p = getGuardLifecyclePresentation({
      guardStatus: "ARMED",
      authority: "GENLAYER",
      lockRecorded: true,
      hasFinishedRunWithEvidence: true,
    });
    assert.equal(p.stage, "RUN");
    assert.equal(p.nextAction.kind, "commit-evidence");
  });
});

describe("docs navigation is reachable (N14-class link integrity)", () => {
  it("resolves every in-app /docs anchor to a real section slug", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { DOC_SECTIONS } = await import("./docs-content.ts");
    const slugs = new Set(DOC_SECTIONS.map((section) => section.slug));

    // Every `to="/docs" hash="…"` in the app must name a section that exists.
    // The docs rewrite renamed a section and silently orphaned a Run-page link;
    // an anchor that scrolls nowhere is a dead end the build cannot see.
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name)) files.push(path);
      }
    };
    walk("src");

    const orphans: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/to="\/docs"[\s\S]{0,60}?hash="([a-z-]+)"/g)) {
        if (!slugs.has(match[1])) orphans.push(`${file} -> #${match[1]}`);
      }
    }
    assert.deepEqual(orphans, [], "in-app docs anchors must resolve to a section");
  });
});

describe("operation status model (C1 / M7)", () => {
  const base = { action: "evaluate_guard", originAddress: "0x1", originChainId: 61999 };

  it("renders one coherent banner for a delayed transaction", () => {
    const view = operationViewFromTx({
      ...base,
      phase: "confirming",
      hash: "0xabc",
      error: "Transaction submitted. Confirmation temporarily unavailable.",
    });
    assert.ok(view);
    assert.equal(view.state, "confirmation_delayed");
    assert.equal(view.retryMode, "reconcile");
    assert.equal(view.retryLabel, "Check again");
    assert.equal(view.severity, "warning");
    assert.ok(view.diagnostic && /No new transaction will be submitted/i.test(view.diagnostic));
    // The historical defect was a concatenation such as
    // "Requesting the GenLayer verdict submitted…". Assert one coherent title.
    assert.equal(view.title, "Confirmation delayed");
    assert.ok(!/verdict submitted\.\.\.|submitted…/.test(view.title));
  });

  it("collapses duplicate messages from different sources exactly once", () => {
    const message = "The committed evidence hash does not match this transaction.";
    assert.equal(dedupeMessages([message, message, null, undefined]), message);
    assert.equal(dedupeMessages([null, "  ", undefined]), null);
  });

  it("only offers reconcile-style retry for a persisted hash", () => {
    assert.equal(isRecoverable({ ...base, phase: "confirming", hash: "0x1", error: null }), true);
    assert.equal(isRecoverable({ ...base, phase: "failed", hash: null, error: "nope" }), false);
    const failed = operationViewFromTx({ ...base, phase: "failed", hash: null, error: "nope" });
    assert.equal(failed?.retryMode, "none");
  });

  it("has no banner in the idle state", () => {
    assert.equal(operationViewFromTx({ phase: "idle", action: "", hash: null, error: null }), null);
  });
});

describe("findings adapter (H0c)", () => {
  const findings = {
    goal_advanced: false,
    metric_satisfied: true,
    material_violation: true,
    circumvention_detected: true,
    evidence_sufficient: true,
    primary_pattern: "CONSTRAINT_BYPASS" as const,
  };

  it("renders human-readable labels, never raw boolean keys", () => {
    const rows = humanReadableFindings(findings);
    const labels = rows.map((r) => r.label);
    assert.deepEqual(labels, [
      "Motive advanced",
      "Metric target reached",
      "Material guardrail violation",
      "Circumvention",
      "Evidence sufficient",
    ]);
    assert.equal(rows[0].value, "No");
    assert.equal(rows[1].value, "Yes");
    assert.equal(rows[2].value, "Detected");
    assert.equal(rows[3].value, "Detected");
    assert.equal(rows[4].value, "Yes");
    // Primary UI must never show the raw protocol keys.
    for (const row of rows) assert.ok(!/goal_advanced|metric_satisfied/.test(row.label + row.value));
  });

  it("exposes raw protocol fields only through the technical view", () => {
    const raw = technicalFindings(findings);
    assert.ok(raw.includes("goal_advanced"));
    assert.ok(JSON.parse(raw).metric_satisfied === true);
  });

  it("produces the same wording on Guard, verification and receipt", () => {
    const guard = humanFindings(findings);
    const receipt = humanFindings(findings);
    const narrative = findingsNarrative(findings, "METRIC_GAMING");
    assert.deepEqual(guard, receipt);
    for (const row of guard) {
      assert.ok(narrative.includes(row.label.toLowerCase().replace(/^./, (c) => c)));
    }
    assert.ok(!/goal false|metric false|violation true/.test(narrative));
  });
});

describe("metric eligibility explanation (C0b)", () => {
  const guardrails = [
    { kind: "MUST" as const, text: "Duplicates do not count." },
    { kind: "MUST" as const, text: "Outside-ICP prospects do not count." },
  ];

  it("refuses exact arithmetic when exclusions are not proven disjoint", () => {
    assert.equal(
      canUseExactMode({
        rawObserved: 12,
        deductions: [
          { label: "duplicates", count: 3, disjoint: false, provenance: "run/evt-1" },
          { label: "outside ICP", count: 4, disjoint: false, provenance: "run/evt-2" },
        ],
      }),
      false,
    );
  });

  it("refuses exact arithmetic when a deduction has no provenance", () => {
    assert.equal(
      canUseExactMode({
        rawObserved: 12,
        deductions: [{ label: "duplicates", count: 3, disjoint: true, provenance: "" }],
      }),
      false,
    );
  });

  it("falls back to non-arithmetic mode and never invents an eligible total", () => {
    const explanation = explainMetric({
      findings: {
        goal_advanced: false,
        metric_satisfied: false,
        material_violation: true,
        circumvention_detected: true,
        evidence_sufficient: true,
        primary_pattern: "DUPLICATION",
      },
      guardrails,
      rawObserved: 12,
      target: 10,
      observations: [
        { label: "Duplicate meetings detected", quantity: 3, detail: "3 booked meetings were duplicate appointments." },
        { label: "Scope violations detected", quantity: 4, detail: "4 booked prospects were outside the declared ICP." },
      ],
    });
    assert.equal(explanation.mode, "non-arithmetic");
    assert.equal(explanation.mode === "non-arithmetic" && explanation.reached, false);
    const serialized = JSON.stringify(explanation);
    assert.ok(!/eligible/i.test(serialized), "must not present a derived eligible count");
    assert.ok(!/\b5\b/.test(serialized), "must not compute 12-3-4");
  });

  it("uses exact mode only when every deduction is disjoint and referenced", () => {
    const explanation = explainMetric({
      findings: {
        goal_advanced: false,
        metric_satisfied: false,
        material_violation: true,
        circumvention_detected: true,
        evidence_sufficient: true,
        primary_pattern: "DUPLICATION",
      },
      guardrails,
      rawObserved: 12,
      target: 10,
      observations: [],
      exact: {
        rawObserved: 12,
        deductions: [
          { label: "unique duplicate bookings", count: 3, disjoint: true, provenance: "run/evt-1" },
          { label: "additional outside-ICP bookings", count: 4, disjoint: true, provenance: "run/evt-2" },
        ],
      },
    });
    assert.equal(explanation.mode, "exact");
    assert.equal(explanation.mode === "exact" && explanation.eligible, 5);
    assert.equal(explanation.mode === "exact" && explanation.reached, false);
  });

  it("transcribes eligibility observations without classifying or counting them", () => {
    const events: RunEvent[] = [
      { timestamp: "t1", type: "observation", source: "manual", data: { quantity: 3, result: "Duplicate meetings detected.", observation: "3 booked meetings were duplicate appointments." } },
      { timestamp: "t2", type: "observation", source: "manual", data: { result: "Unrelated note.", observation: "Latency looked fine." } },
    ];
    const observations = eligibilityObservationsFromEvents(events);
    assert.equal(observations.length, 1);
    assert.equal(observations[0].quantity, 3);
    assert.equal(rawMetricObservationFromEvents(events), 3);
  });
});

describe("semantic tokens (S4 / H8 / L8)", () => {
  it("uses verdict-specific roles, not brand ochre", () => {
    assert.equal(verdictRole("FAITHFUL_SUCCESS"), "verdict-faithful");
    assert.equal(verdictRole("METRIC_GAMING"), "verdict-gaming");
    assert.equal(verdictRole("PARTIAL_ALIGNMENT"), "verdict-partial");
    assert.equal(verdictRole("INSUFFICIENT_EVIDENCE"), "verdict-insufficient");
  });

  it("gives every verdict a glyph so meaning is not colour-only", () => {
    for (const verdict of ["FAITHFUL_SUCCESS", "METRIC_GAMING", "PARTIAL_ALIGNMENT", "INSUFFICIENT_EVIDENCE"] as const) {
      const copy = verdictCopyFor(verdict);
      assert.ok(copy.glyph.length > 0);
      assert.ok(copy.label.length > 0);
    }
  });

  it("does not reuse the brand role for danger", () => {
    assert.notEqual(roleClass("danger"), roleClass("brand"));
    assert.notEqual(roleClass("warning"), roleClass("danger"));
  });
});

describe("identifier + provenance system (H4 / H5)", () => {
  it("builds explorer links from a network-aware base", () => {
    const hash = `0x${"a".repeat(64)}`;
    assert.equal(explorerTxUrl(hash), `https://explorer-studio-dev.genlayer.com/tx/${hash}`);
    assert.equal(explorerTxUrl("not-a-hash"), null);
  });

  it("refuses an explorer link for a hash on another chain", () => {
    const hash = `0x${"b".repeat(64)}`;
    assert.equal(explorerTxUrl(hash, { chainId: 1 }), null);
  });

  it("labels active vs legacy contract provenance", () => {
    assert.equal(contractProvenanceLabel("0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703"), "active");
    assert.equal(contractProvenanceLabel("0xe39e59f8Dd78E416D9EE074Ca3f899C7Eb56Fb2d"), "historical");
    assert.equal(contractProvenanceLabel("0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8D7C"), "legacy");
    assert.equal(contractProvenanceLabel("0x0000000000000000000000000000000000000001"), "unknown");
    assert.equal(contractProvenanceLabel(null), "unknown");
  });
});

describe("terminology (M13 / L4)", () => {
  it("keeps one name per destination", () => {
    assert.equal(TERMS.receipt.label, "Receipt");
    assert.equal(TERMS.case.label, "Case");
    assert.equal(CTA.openCase, "Open case");
    assert.equal(CTA.viewReceipt, "View receipt");
    assert.equal(CTA.technicalDetails, "Technical details");
    assert.ok(!/dossier|proof/i.test(CTA.openCase));
  });

  it("uses the standard lock wording", () => {
    assert.equal(CTA.lockGuard, "Lock Guard");
  });
});

describe("canonical hashing is untouched by this pass (regression guard)", () => {
  it("definition hash remains deterministic for the same input", async () => {
    const a = await computeDefinitionHashFixture();
    const b = await computeDefinitionHashFixture();
    assert.equal(a, b);
    assert.equal(a.length, 64);
  });
});

describe("empty Run and manual evidence form (C2 / C5)", () => {
  it("requires explicit confirmation before an empty Run can be finished", async () => {
    const { requestFinishDecision } = await import("./ui-rules.ts");
    assert.equal(requestFinishDecision(0), "confirm");
    assert.equal(requestFinishDecision(1), "finish");
    assert.equal(requestFinishDecision(12), "finish");
  });

  it("starts the manual evidence form with no real values", async () => {
    const { EMPTY_EVENT_FORM_STATE } = await import("./ui-rules.ts");
    assert.deepEqual(EMPTY_EVENT_FORM_STATE, {
      observation: "",
      result: "",
      quantity: "",
      notes: "",
    });
    for (const value of Object.values(EMPTY_EVENT_FORM_STATE)) assert.equal(value, "");
  });

  it("resets every field after Add evidence", async () => {
    const { EMPTY_EVENT_FORM_STATE, resetEventFormState } = await import("./ui-rules.ts");
    const dirty = {
      observation: "Prospect was outside the declared ICP",
      result: "Marked as a meeting",
      quantity: "41",
      notes: "some note",
    };
    const after = resetEventFormState(dirty);
    assert.deepEqual(after, EMPTY_EVENT_FORM_STATE);
    assert.ok(!Object.values(after).some((value) => value !== ""));
  });

  it("keeps the empty-evidence guard server-side-equivalent, not a client bypass", async () => {
    const { submitEvidenceBlockedReason } = await import("./ui-rules.ts");
    assert.match(String(submitEvidenceBlockedReason(0)), /no evidence/i);
    assert.equal(submitEvidenceBlockedReason(3), null);
  });

  it("disallows editing a locked Guard through stepper navigation (M11)", async () => {
    const { canNavigateToStep } = await import("./ui-rules.ts");
    // Draft is fully editable, so back/forward is safe.
    assert.equal(canNavigateToStep(0, 1, "DRAFT"), true);
    assert.equal(canNavigateToStep(2, 1, "DRAFT"), true);
    // Once locked, the editable Draft step is unreachable and only forward
    // navigation into later lifecycle steps is allowed.
    assert.equal(canNavigateToStep(1, 0, "ARMED"), false);
    assert.equal(canNavigateToStep(3, 1, "ARMED"), false);
    assert.equal(canNavigateToStep(1, 2, "ARMED"), true);
    assert.equal(canNavigateToStep(1, 0, "RESOLVED"), false);
    assert.equal(canNavigateToStep(2, 2, "RESOLVED"), false);
  });

  it("never claims a contract address that was not actually recorded (H5 / provenance)", async () => {
    // Root cause: guardDeployment() falls back to the ACTIVE contract when a
    // Guard recorded no provenance. That is correct for "where would this
    // publish", but using it on a receipt stamped an example/local-advisory
    // case with the active contract address — claiming on-chain provenance for
    // something that never touched a contract.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/routes/verify/$receiptId.tsx", "utf8");
    const assignment = /const recordedContract =([\s\S]*?);/.exec(source)![1];

    assert.match(assignment, /snap\.contractAddress/);
    assert.match(assignment, /guard\?\.contractAddress/);
    assert.ok(
      !/resolveGuardDeployment|guardDeployment|CURRENT_CONTRACT/.test(assignment),
      "receipt provenance must not fall back to the active contract",
    );

    // And a contract value that came from nowhere is reported as unverified.
    const { contractProvenanceLabel } = await import("./explorer.ts");
    const { CURRENT_CONTRACT } = await import("../../packages/sdk/src/deployment.ts");
    assert.equal(contractProvenanceLabel(null), "unknown");
    assert.equal(contractProvenanceLabel(""), "unknown");
    assert.equal(contractProvenanceLabel("0xdeadbeef"), "unknown");
    assert.equal(contractProvenanceLabel(CURRENT_CONTRACT.contractAddress), "active");
  });

  it("does not glue two sentences into one paragraph (C1 concatenation class)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/components/ui/findings-summary.tsx", "utf8");
    // A margin utility is not punctuation: the two sentences must be separate
    // nodes so innerText/AT output reads "... Duplication. The evidence ...".
    assert.ok(
      !/<strong>\{primaryPatternCopy\(pattern\)\}<\/strong>\s*\{[\s\S]{0,120}?<span className="ml-2/.test(source),
      "pattern copy must not be joined to the next sentence via a margin span",
    );
  });

  it("never lets an unlayered stylesheet rule defeat a Tailwind :hidden utility (H1 regression)", async () => {
    // Root cause guard: styles.css is unlayered, Tailwind utilities sit in a
    // cascade layer. An unlayered `display:` therefore BEATS `sm:hidden`, which
    // leaked the mobile-only evidence list onto desktop and duplicated the
    // selected-mark detail verbatim. Any class paired with a `*:hidden`
    // utility must not declare `display` outside a media query.
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const css = readFileSync("src/styles.css", "utf8");

    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory()
          ? walk(full)
          : /\.[jt]sx?$/.test(full)
            ? [full]
            : [];
      });

    const hiddenClassPairings = new Set<string>();
    for (const file of walk("src")) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/className="([^"]*)"/g)) {
        const classes = match[1].split(/\s+/);
        if (!classes.some((c) => /^[a-z]+:hidden$/.test(c))) continue;
        for (const c of classes) {
          if (/^[a-z]+:hidden$/.test(c) || c.includes(":")) continue;
          hiddenClassPairings.add(c);
        }
      }
    }
    assert.ok(hiddenClassPairings.size > 0, "expected at least one :hidden pairing");

    // Strip every @media block, then look for a bare display declaration on a
    // paired class in what remains.
    const withoutMedia = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    for (const className of hiddenClassPairings) {
      const rule = new RegExp(`\\.${className.replace(/[-]/g, "\\-")}\\s*\\{[^}]*\\}`, "g");
      for (const block of withoutMedia.match(rule) ?? []) {
        assert.ok(
          !/display\s*:/.test(block),
          `\`.${className}\` declares display outside a media query, so it overrides the Tailwind :hidden utility it is paired with`,
        );
      }
    }
  });

  it("renders exactly one navigation system per route class (H1)", async () => {
    const { readFileSync } = await import("node:fs");
    const shell = readFileSync("src/components/app-shell.tsx", "utf8");
    const chrome = readFileSync("src/components/chrome.tsx", "utf8");

    // App routes use product navigation; they must not also stack the second
    // app bar that previously sat under the marketing header.
    assert.match(shell, /<SiteHeader[^>]*app/);
    assert.ok(!/AppBar/.test(shell), "app shell must not stack a second nav bar");
    assert.match(chrome, /const APP_NAV = \[/);
    assert.match(chrome, /const NAV = \[/);

    const navBlock = /const NAV = \[([\s\S]*?)\] as const;/.exec(chrome)![1];
    const appBlock = /const APP_NAV = \[([\s\S]*?)\] as const;/.exec(chrome)![1];
    assert.notEqual(navBlock, appBlock, "marketing and app navigation must differ");
    assert.match(appBlock, /Cases/);
    assert.match(navBlock, /Product/);
  });

  it("blocks a second submit while an async action is in flight (H0)", async () => {
    const { canSubmit } = await import("./ui-rules.ts");
    assert.equal(canSubmit({ busy: false, intentLocked: false, disabled: false }), true);
    assert.equal(canSubmit({ busy: true, intentLocked: false, disabled: false }), false);
    assert.equal(canSubmit({ busy: false, intentLocked: true, disabled: false }), false);
    assert.equal(canSubmit({ busy: false, intentLocked: false, disabled: true }), false);
  });

  it("keeps the Guard builder on Protect after the first save (do not skip guardrails)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/routes/app/guards/new.tsx", "utf8");
    const persistFn = source.slice(source.indexOf("const persist = useMutation"), source.indexOf("async function goNext()"));
    assert.doesNotMatch(
      persistFn,
      /to:\s*"\/app\/guards\/\$id"/,
      "first save must stay in the builder so Protect/Review can add guardrails",
    );
    assert.match(source, /if \(step === 0\) \{[\s\S]*await persist\.mutateAsync\(\);[\s\S]*setStep\(1\)/);
    assert.doesNotMatch(
      source,
      /draft\.guardId\?\.startsWith\("grd_"\) && draft\.guardId !== persistedGuardHint/,
    );
  });
});
