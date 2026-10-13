import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

// Guard #2 (the 80-meeting case) is historical (D2). It may appear only in the docs "archive" section,
// in historical fixtures/scripts, and in tests; never in product UI, the landing, the demo or docs prose.
const root = new URL("../../", import.meta.url);
const walk = (dir: string): string[] =>
  readdirSync(new URL(dir, root)).flatMap((n) => {
    const p = `${dir}${n}`;
    return statSync(new URL(p, root)).isDirectory() ? walk(`${p}/`) : [p];
  });
const LEGACY = /80[- ]meetings?/i;

test("no '80 meetings' in routes, components or markdown docs", () => {
  const files = [...walk("src/routes/"), ...walk("src/components/"), "README.md", ...walk("docs/").filter((f) => f.endsWith(".md") && !f.startsWith("docs/certification/"))];
  const hits = files.filter((f) => LEGACY.test(readFileSync(new URL(f, root), "utf8")));
  assert.deepEqual(hits, []);
});

test("in docs-content.ts, '80 meetings' appears only inside the archive section", () => {
  const src = readFileSync(new URL("src/lib/docs-content.ts", root), "utf8");
  const at = src.indexOf('slug: "archive"');
  assert.ok(at > 0);
  assert.doesNotMatch(src.slice(0, at), LEGACY);
});
