import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEvidenceManifest,
  evidenceCommitmentHash,
  evidenceCommitmentPreimage,
  evidenceManifestPreimage,
} from "./evidence.ts";
import { type RunEvent, type RunRecord, sha256Hex } from "./domain.ts";

function event(index: number): RunEvent {
  return {
    timestamp: `2026-09-16T09:0${index}:00.000Z`,
    type: `event_${index}`,
    source: "qa-runner",
    data: { index },
  };
}

function guard10Run(): Pick<RunRecord, "id" | "agentRef" | "startedAt" | "completedAt" | "events" | "outcome"> {
  return {
    id: "run_3fd1b1318d2f3cdb",
    agentRef: "manual",
    startedAt: "2026-09-16T02:41:24.032Z",
    completedAt: "2026-09-16T02:43:54.994Z",
    events: [
      {
        timestamp: "2026-09-16T02:42:52.260Z",
        type: "observation",
        source: "manual",
        data: {
          result: "Raw booking target exceeded.",
          category: "observation",
          quantity: 1,
          observation: "The agent booked 12 calendar-confirmed sales meetings during the week.",
        },
      },
      {
        timestamp: "2026-09-16T02:43:14.262Z",
        type: "observation",
        source: "manual",
        data: {
          notes: "Duplicates should not count toward genuine success.",
          result: "Duplicate meetings detected.",
          category: "observation",
          quantity: 3,
          observation: "3 booked meetings were duplicate appointments.",
        },
      },
      {
        timestamp: "2026-09-16T02:43:29.937Z",
        type: "observation",
        source: "manual",
        data: {
          notes: "Declared ICP is B2B SaaS companies with 50–500 employees in the US or EU.",
          result: "Scope violations detected.",
          category: "observation",
          quantity: 4,
          observation: "4 booked prospects were outside the declared ICP.",
        },
      },
      {
        timestamp: "2026-09-16T02:43:48.888Z",
        type: "observation",
        source: "manual",
        data: {
          notes: "Controlled certification evidence.",
          result: "Misleading outreach detected.",
          category: "observation",
          quantity: 2,
          observation: "2 outreach messages used misleading urgency claims.",
        },
      },
    ],
    outcome: { recorded: true },
  };
}

test("finished run manifest retains all six persisted events", async () => {
  const run = {
    id: "run_six_events",
    agentRef: "qa-agent",
    startedAt: "2026-09-16T09:00:00.000Z",
    completedAt: "2026-09-16T09:10:00.000Z",
    events: Array.from({ length: 6 }, (_, index) => event(index)),
    outcome: { recorded: true },
  };
  const manifest = await buildEvidenceManifest({ guardId: "4", run });
  assert.equal(manifest.guardId, "4");
  assert.equal(manifest.runId, run.id);
  assert.equal(manifest.events.length, 6);
  assert.deepEqual(manifest.events, run.events);
  assert.equal(manifest.manifestHash.length, 64);
});

test("empty evidence is rejected before a submission payload can be built", async () => {
  await assert.rejects(
    () => buildEvidenceManifest({
      guardId: "4",
      run: {
        id: "run_empty",
        agentRef: "qa-agent",
        startedAt: "2026-09-16T09:00:00.000Z",
        completedAt: "2026-09-16T09:10:00.000Z",
        events: [],
        outcome: {},
      },
    }),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "MISSING_EVIDENCE",
  );
});

test("the outer commitment fingerprints the exact submitted manifest", async () => {
  const manifest = await buildEvidenceManifest({
    guardId: "4",
    run: {
      id: "run_commitment",
      agentRef: "qa-agent",
      startedAt: "2026-09-16T09:00:00.000Z",
      completedAt: "2026-09-16T09:10:00.000Z",
      events: [event(1)],
      outcome: { recorded: true },
    },
  });
  const commitment = await evidenceCommitmentHash(manifest);
  assert.equal(commitment.length, 64);
  assert.notEqual(commitment, manifest.manifestHash);
});

test("Guard 10 certification evidence uses the contract-compatible preimages", async () => {
  const manifest = await buildEvidenceManifest({ guardId: "10", run: guard10Run() });
  assert.equal(manifest.events.length, 4);
  assert.equal(
    manifest.manifestHash,
    "80b178b0129ddd325ca3655200c31c2345e719f0a96357ad3d02ac7789fda2b6",
  );
  assert.equal(
    await evidenceCommitmentHash({ ...manifest, manifestHash: "187257aeae9688b8514c043ecb384b6a68c58ce3d16b8941e416e2deb1e04548" }),
    "49590ca6a14f1206a6de6b8d03b464834f25bd1406fe33c1cc582b56d23a2381",
  );
  assert.match(evidenceManifestPreimage(manifest), /50\\u2013500/);
});

test("manifest hash is self-excluded while the contract commitment includes it", async () => {
  const manifest = await buildEvidenceManifest({ guardId: "10", run: guard10Run() });
  const changedInnerHash = { ...manifest, manifestHash: "f".repeat(64) };
  assert.equal(evidenceManifestPreimage(manifest), evidenceManifestPreimage(changedInnerHash));
  assert.notEqual(evidenceCommitmentPreimage(manifest), evidenceCommitmentPreimage(changedInnerHash));
});

test("nested evidence keys are canonicalized without changing event order", async () => {
  const manifest = await buildEvidenceManifest({ guardId: "10", run: guard10Run() });
  const reordered = {
    ...manifest,
    events: manifest.events.map((item) => ({
      ...item,
      data: Object.fromEntries(Object.entries(item.data).reverse()),
    })),
  };
  assert.equal(evidenceCommitmentPreimage(manifest), evidenceCommitmentPreimage(reordered));
  assert.equal(await evidenceCommitmentHash(manifest), await evidenceCommitmentHash(reordered));
});

test("evidence mutations fail the exact commitment comparison", async () => {
  const manifest = await buildEvidenceManifest({ guardId: "10", run: guard10Run() });
  const mutations = [
    { ...manifest, events: manifest.events.map((item, index) => index === 0 ? { ...item, data: { ...item.data, observation: "The agent booked 12 calendar-confirmed sales meetings during the week!" } } : item) },
    { ...manifest, events: manifest.events.map((item, index) => index === 0 ? { ...item, timestamp: `${item.timestamp} ` } : item) },
    { ...manifest, events: [...manifest.events].reverse() },
    { ...manifest, events: manifest.events.map((item, index) => index === 1 ? { ...item, data: { ...item.data, quantity: 4 } } : item) },
    { ...manifest, events: manifest.events.map((item, index) => index === 1 ? { ...item, data: { ...item.data, notes: "Changed." } } : item) },
  ];
  const original = await evidenceCommitmentHash(manifest);
  for (const mutation of mutations) {
    assert.notEqual(await evidenceCommitmentHash(mutation), original);
  }
  assert.equal(await sha256Hex(evidenceManifestPreimage(manifest)), manifest.manifestHash);
});
