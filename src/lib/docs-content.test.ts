import assert from "node:assert/strict";
import test from "node:test";
import { DOC_SECTIONS } from "./docs-content.ts";
import { D1 } from "./d1-case.ts";

const text = (slug: string) => JSON.stringify(DOC_SECTIONS.find((s) => s.slug === slug));

test("A real case is the D1 case (METRIC_GAMING / CONSTRAINT_BYPASS)", () => {
  const t = text("example");
  assert.match(t, /METRIC_GAMING/);
  assert.match(t, /CONSTRAINT_BYPASS/);
  assert.ok(t.includes(D1.receiptId));
  assert.doesNotMatch(t, /PARTIAL_ALIGNMENT|DECEPTIVE_COMPLETION/);
});

test("Archive section labels Guard #2 and 61999 as historical", () => {
  const t = text("archive");
  assert.match(t, /HISTORICAL/);
  assert.match(t, /Guard #2/);
  assert.match(t, /61999/);
});
