import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { BUILDER_STEPS } from "./terminology.ts";

/**
 * Scan rule: comments are stripped first. Then user-visible text is checked for protocol words.
 * - "armed" / "fingerprint" are matched case-sensitively as words, so the stored status "ARMED",
 *   the `txArm` field and `armLocal` identifiers are ignored.
 * - The stored kinds "MUST" / "QUALITY" may stay as quoted literals and comparisons; what is banned is
 *   rendering them: JSX text `>MUST<` or a raw `{x.kind}` child. Use GUARDRAIL_KIND_LABEL instead.
 */
const FILES = [
  "src/routes/app/guards/new.tsx",
  "src/components/ui/lock-summary.tsx",
  "src/components/ui/next-action-card.tsx",
  "src/components/ui/stepper.tsx",
  "src/lib/lifecycle.ts",
];

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("builder copy", () => {
  for (const file of FILES) {
    it(`${file} shows no protocol words`, () => {
      const src = strip(readFileSync(file, "utf8"));
      assert.doesNotMatch(src, /\b[Aa]rmed\b/, "say locked");
      assert.doesNotMatch(src, /\b[Ff]ingerprint/, "say evidence ID");
      assert.doesNotMatch(src, />\s*(MUST|QUALITY)\s*</, "use GUARDRAIL_KIND_LABEL");
      assert.doesNotMatch(src, />\s*\{[\w.]*\.kind\}\s*</, "use GUARDRAIL_KIND_LABEL");
    });
  }

  it("BUILDER_STEPS has three steps with stated costs", () => {
    assert.equal(BUILDER_STEPS.length, 3);
    assert.deepEqual(BUILDER_STEPS.map((s) => s.n), [1, 2, 3]);
    for (const s of BUILDER_STEPS) assert.ok(s.cost.length > 0 && s.title.length > 0);
    assert.match(BUILDER_STEPS[0].cost, /free/i);
    assert.match(BUILDER_STEPS[1].cost, /fee/i);
    assert.match(BUILDER_STEPS[2].cost, /fees/i);
  });

  it("the builder renders the steps and the explicit save label", () => {
    const src = readFileSync("src/routes/app/guards/new.tsx", "utf8");
    assert.match(src, /BUILDER_STEPS/);
    assert.match(src, /Save draft \(free signature\)/);
  });
});
