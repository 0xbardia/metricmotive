import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("favicon.svg hex values match @theme tokens", () => {
  const css = read("src/styles.css");
  const tok = (n: string) => css.match(new RegExp(`--color-${n}:\\s*(#[0-9a-fA-F]{6})`))![1].toLowerCase();
  const hexes = [...read("public/favicon.svg").replace(/<!--[\s\S]*?-->/g, "").matchAll(/#[0-9a-fA-F]{6}/g)].map((m) =>
    m[0].toLowerCase(),
  );
  assert.deepEqual(new Set(hexes), new Set([tok("carbon"), tok("ochre"), tok("sage")]));
});

test("logo.tsx has no raw hex colors", () => {
  assert.doesNotMatch(read("src/components/brand/logo.tsx"), /#[0-9a-fA-F]{3,8}\b/);
});
