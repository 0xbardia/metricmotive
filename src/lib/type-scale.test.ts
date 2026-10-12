import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const theme = css.slice(css.indexOf("@theme"));
const ORDER = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl"];

function sizeAt(name: string, width: number): number {
  const m = new RegExp(`--text-${name}:\\s*([^;]+);`).exec(theme);
  assert.ok(m, `missing --text-${name}`);
  const v = m[1].trim();
  const rem = (s: string) => parseFloat(s) * 16;
  const val = (s: string) => (s.endsWith("vw") ? (parseFloat(s) * width) / 100 : rem(s));
  const c = /^clamp\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/.exec(v);
  return c ? Math.min(Math.max(val(c[1].trim()), val(c[2].trim())), val(c[3].trim())) : val(v);
}

test("type scale is non-decreasing at every viewport width", () => {
  for (let w = 320; w <= 2560; w++) {
    for (let i = 1; i < ORDER.length; i++) {
      assert.ok(sizeAt(ORDER[i - 1], w) <= sizeAt(ORDER[i], w), `${ORDER[i - 1]} > ${ORDER[i]} at ${w}px`);
    }
  }
});

test("4xl/5xl at 390px are 36/48px", () => {
  assert.equal(sizeAt("4xl", 390), 36);
  assert.equal(sizeAt("5xl", 390), 48);
});
