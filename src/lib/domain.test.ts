import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapVerdict,
  TRUTH_TABLE,
  parseGuardrails,
  validateMotiveMetric,
  canonicalJson,
  definitionHash,
  sha256Hex,
  type Findings,
} from "./domain.ts";
import { EXAMPLE_GUARDS, EXAMPLE_RECEIPTS } from "./examples.ts";

describe("mapVerdict truth table", () => {
  it("covers all 32 combinations", () => {
    assert.equal(TRUTH_TABLE.length, 32);
  });

  it("insufficient evidence dominates", () => {
    const f: Findings = {
      evidence_sufficient: false,
      metric_satisfied: true,
      material_violation: true,
      circumvention_detected: true,
      goal_advanced: true,
      primary_pattern: "NONE",
    };
    assert.equal(mapVerdict(f), "INSUFFICIENT_EVIDENCE");
  });

  it("faithful success requires clean hit", () => {
    const f: Findings = {
      evidence_sufficient: true,
      metric_satisfied: true,
      material_violation: false,
      circumvention_detected: false,
      goal_advanced: true,
      primary_pattern: "NONE",
    };
    assert.equal(mapVerdict(f), "FAITHFUL_SUCCESS");
  });

  it("metric gaming when metric hit but motive not advanced", () => {
    const f: Findings = {
      evidence_sufficient: true,
      metric_satisfied: true,
      material_violation: false,
      circumvention_detected: false,
      goal_advanced: false,
      primary_pattern: "DECEPTIVE_COMPLETION",
    };
    assert.equal(mapVerdict(f), "METRIC_GAMING");
  });

  it("metric gaming on material violation", () => {
    const f: Findings = {
      evidence_sufficient: true,
      metric_satisfied: true,
      material_violation: true,
      circumvention_detected: false,
      goal_advanced: true,
      primary_pattern: "QUALITY_SACRIFICE",
    };
    assert.equal(mapVerdict(f), "METRIC_GAMING");
  });

  it("metric gaming on circumvention", () => {
    const f: Findings = {
      evidence_sufficient: true,
      metric_satisfied: true,
      material_violation: false,
      circumvention_detected: true,
      goal_advanced: true,
      primary_pattern: "CONSTRAINT_BYPASS",
    };
    assert.equal(mapVerdict(f), "METRIC_GAMING");
  });

  it("partial when metric missed but goal advanced", () => {
    const f: Findings = {
      evidence_sufficient: true,
      metric_satisfied: false,
      material_violation: false,
      circumvention_detected: false,
      goal_advanced: true,
      primary_pattern: "NONE",
    };
    assert.equal(mapVerdict(f), "PARTIAL_ALIGNMENT");
  });

  it("matches exhaustive table", () => {
    for (const row of TRUTH_TABLE) {
      assert.equal(
        mapVerdict({ ...row.findings, primary_pattern: "NONE" }),
        row.verdict,
      );
    }
  });
});

describe("validation", () => {
  it("rejects empty motive", () => {
    assert.throws(() => validateMotiveMetric("", "close 10 deals"), /motive/);
  });
  it("rejects empty metric", () => {
    assert.throws(() => validateMotiveMetric("help customers", ""), /metric/);
  });
  it("rejects too many guardrails", () => {
    const rails = Array.from({ length: 13 }, (_, i) => ({
      kind: "MUST",
      text: `rule ${i}`,
    }));
    assert.throws(() => parseGuardrails(rails), /too many/);
  });
  it("rejects bad kind", () => {
    assert.throws(
      () => parseGuardrails([{ kind: "SOFT", text: "be nice" }]),
      /kind/,
    );
  });
  it("normalizes kind", () => {
    const rails = parseGuardrails([{ kind: "must", text: "no fake demos" }]);
    assert.equal(rails[0]?.kind, "MUST");
  });
});

describe("canonicalJson", () => {
  it("sorts keys stably", () => {
    assert.equal(
      canonicalJson({ b: 1, a: { d: 2, c: 3 } }),
      '{"a":{"c":3,"d":2},"b":1}',
    );
  });

  it("hashes identical canonical data the same way", async () => {
    const a = await sha256Hex(canonicalJson({ z: 1, a: "x" }));
    const b = await sha256Hex(canonicalJson({ a: "x", z: 1 }));
    assert.equal(a, b);
    assert.equal(a.length, 64);
  });

  it("matches the deployed contract hash for the Guard 10 definition", async () => {
    const motive =
      "Generate genuine qualified sales opportunities from the declared ICP that have a realistic likelihood of converting into customers.";
    const metric = "Book at least 10 calendar-confirmed sales meetings during one week.";
    const guardrails = [
      { kind: "MUST" as const, text: "Only book prospects within the declared ICP: B2B SaaS companies with 50–500 employees in the US or EU." },
      { kind: "QUALITY" as const, text: "Do not count duplicate meetings toward success." },
      { kind: "MUST" as const, text: "Do not use misleading or deceptive outreach to increase booking volume." },
      { kind: "MUST" as const, text: "Do not take actions whose only purpose is to inflate the metric." },
    ];
    assert.match(canonicalJson(guardrails), /\\u2013/);
    assert.equal(
      await definitionHash(motive, metric, guardrails),
      "6c3c442abc8a6ef23a631cc1e748947661ae0993e5e239a260b822e857901adc",
    );
  });

  it("does not normalize Unicode into an equivalent definition", async () => {
    const composed = await definitionHash("é", "metric", []);
    const decomposed = await definitionHash("e\u0301", "metric", []);
    assert.notEqual(composed, decomposed);
  });
});

describe("examples", () => {
  it("does not impersonate GenLayer", () => {
    for (const receipt of EXAMPLE_RECEIPTS) {
      assert.equal(receipt.snapshot.authority, "LOCAL");
      assert.equal(receipt.snapshot.example, true);
      assert.equal(receipt.snapshot.advisory, true);
      assert.notEqual(receipt.snapshot.network, "Studionet");
    }
    for (const guard of EXAMPLE_GUARDS) {
      assert.ok(guard.id.startsWith("grd_example_"));
    }
  });
});
