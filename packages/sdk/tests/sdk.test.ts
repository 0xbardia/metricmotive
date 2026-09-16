import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MetricMotiveClient,
  MetricMotiveError,
  buildEvidenceManifest,
  canonicalJson,
  eventOf,
  sha256Hex,
} from "../src/index.ts";

test("canonicalJson sorts keys", () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test("canonicalJson matches the deployed Guard 10 definition hash", async () => {
  const definition = {
    guardrails: [
      { kind: "MUST", text: "Only book prospects within the declared ICP: B2B SaaS companies with 50–500 employees in the US or EU." },
      { kind: "QUALITY", text: "Do not count duplicate meetings toward success." },
      { kind: "MUST", text: "Do not use misleading or deceptive outreach to increase booking volume." },
      { kind: "MUST", text: "Do not take actions whose only purpose is to inflate the metric." },
    ],
    metric: "Book at least 10 calendar-confirmed sales meetings during one week.",
    motive: "Generate genuine qualified sales opportunities from the declared ICP that have a realistic likelihood of converting into customers.",
  };
  assert.match(canonicalJson(definition), /\\u2013/);
  assert.equal(
    await sha256Hex(canonicalJson(definition)),
    "6c3c442abc8a6ef23a631cc1e748947661ae0993e5e239a260b822e857901adc",
  );
});

test("sha256Hex is stable", async () => {
  const a = await sha256Hex("metricmotive");
  const b = await sha256Hex("metricmotive");
  assert.equal(a, b);
  assert.equal(a.length, 64);
});

test("memory recorder start / event / complete", async () => {
  const mm = new MetricMotiveClient();
  const run = await mm.startRun({ guardId: "grd_local", agentRef: "sales-agent" });
  assert.equal(run.status, "STARTED");
  assert.equal(run.authority, "local-memory");
  await mm.recordEvent(
    run.id,
    eventOf("bookings", { meetings_booked: 83, target: 80 }, "crm"),
  );
  const finished = await mm.completeRun(run.id, { meetings_booked: 83, qualified: 9 });
  assert.equal(finished.status, "FINISHED");
  assert.equal(finished.outcome.meetings_booked, 83);
  const manifest = await mm.evidenceFromRun("grd_local", finished);
  assert.equal(manifest.schema, "metricmotive.evidence.v1");
  assert.equal(manifest.events.length, 1);
  assert.equal(manifest.manifestHash.length, 64);
  assert.ok(JSON.stringify(manifest).length < 8000);
});

test("memory recorder preserves six events through completion and manifest generation", async () => {
  const mm = new MetricMotiveClient();
  const run = await mm.startRun({ guardId: "grd_six", agentRef: "qa-agent" });
  for (let index = 0; index < 6; index += 1) {
    await mm.recordEvent(run.id, eventOf(`event_${index}`, { index }, "qa"));
  }
  const finished = await mm.completeRun(run.id, { recorded: true });
  const manifest = await mm.evidenceFromRun("grd_six", finished);
  assert.equal(finished.events.length, 6);
  assert.equal(manifest.events.length, 6);
  assert.deepEqual(manifest.events, finished.events);
});

test("evidence hash matches canonical payload", async () => {
  const run = {
    id: "run_1",
    agentRef: "sales-agent",
    startedAt: "2026-09-08T09:00:00Z",
    completedAt: "2026-09-12T18:00:00Z",
    events: [eventOf("note", { ok: true })],
    outcome: { meetings_booked: 83 },
  };
  const manifest = await buildEvidenceManifest({ guardId: "g1", run });
  const unsigned = { ...manifest } as { manifestHash?: string };
  delete unsigned.manifestHash;
  assert.equal(manifest.manifestHash, await sha256Hex(canonicalJson(unsigned)));
});

test("writes require an account and do not hide the boundary", async () => {
  const mm = new MetricMotiveClient();
  await assert.rejects(
    () => mm.createGuard({ motive: "m".repeat(12), metric: "n".repeat(8), guardrails: [] }),
    (err: unknown) => {
      assert.ok(err instanceof MetricMotiveError);
      assert.equal(err.code, "NEED_ACCOUNT");
      assert.equal(err.authority, "chain");
      return true;
    },
  );
});

test("cannot append to a finished run", async () => {
  const mm = new MetricMotiveClient();
  const run = await mm.startRun({ guardId: "g" });
  await mm.completeRun(run.id, {});
  await assert.rejects(() => mm.recordEvent(run.id, eventOf("late", {})), /finished/i);
});
