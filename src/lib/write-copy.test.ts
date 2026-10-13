/**
 * Scan rules: in chain-actions.tsx, operations.ts and tx-status-banner.tsx, strip block and
 * line comments (including JSX comment blocks), then reject the words "armed" and "fingerprint(s)"
 * (case-insensitive, whole word) anywhere in the remaining text. Identifiers such as
 * `arm_guard` / `armRecovery` do not match.
 */
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const FILES = [
  "src/components/chain-actions.tsx",
  "src/lib/operations.ts",
  "src/components/ui/tx-status-banner.tsx",
];

for (const file of FILES) {
  test(`${file} has no 'armed' / 'fingerprint' in user-visible text`, () => {
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/(\s)\/\/ .*$/gm, "$1");
    const hits = code.match(/.*\b(armed|fingerprints?)\b.*/gi) ?? [];
    assert.deepEqual(hits, []);
  });
}
