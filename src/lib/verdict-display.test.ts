import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { VERDICT_COPY } from "./tokens.ts";
import { verdictCopy } from "./domain.ts";
import { VERDICT_MEANING } from "./terminology.ts";

const VERDICTS = ["FAITHFUL_SUCCESS", "METRIC_GAMING", "PARTIAL_ALIGNMENT", "INSUFFICIENT_EVIDENCE"] as const;

describe("one verdict display", () => {
  it("gives every verdict a distinct label, glyph and meaning, read from VERDICT_MEANING", () => {
    for (const v of VERDICTS) {
      assert.ok(VERDICT_COPY[v].label && VERDICT_COPY[v].glyph && VERDICT_MEANING[v]);
      assert.equal(VERDICT_COPY[v].summary, VERDICT_MEANING[v]);
      assert.equal(verdictCopy(v).lede, VERDICT_MEANING[v]);
      assert.equal(verdictCopy(v).title, VERDICT_COPY[v].label);
    }
    for (const pick of [(v: (typeof VERDICTS)[number]) => VERDICT_COPY[v].label, (v: (typeof VERDICTS)[number]) => VERDICT_COPY[v].glyph, (v: (typeof VERDICTS)[number]) => VERDICT_MEANING[v]]) {
      assert.equal(new Set(VERDICTS.map(pick)).size, 4);
    }
    assert.deepEqual(
      VERDICTS.map((v) => VERDICT_COPY[v].label),
      ["Faithful success", "Metric gaming detected", "Partial alignment", "Insufficient evidence"],
    );
  });

  it("no surface formats a verdict ad hoc", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx$/.test(p)) files.push(p);
      }
    };
    walk("src");
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      assert.doesNotMatch(src, /verdict[\w.?!]*\.replace\(\/_\/g/i, `${f} formats a verdict ad hoc`);
    }
    for (const f of ["src/routes/verify/$receiptId.tsx", "src/components/demo/replay.tsx"]) {
      assert.match(readFileSync(f, "utf8"), /<VerdictSummary/, `${f} must use VerdictSummary`);
    }
  });
});
