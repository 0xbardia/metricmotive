import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "styles.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

// Phase 2 (M3): remove or convert to transform/opacity
const PAINT_ALLOWLIST = ["background-color", "box-shadow", "border-color", "color", "outline-color", "text-decoration-color", "stroke", "fill", "background"];
const FORBIDDEN = /^(max-width|min-height|padding(-[a-z]+)?|width|height|top|left|right|bottom|margin(-[a-z]+)?|filter|blur|all|[a-z-]*(width|height))$/;

// Property names used by every transition / animation declaration, plus keyframe bodies.
function transitionProps() {
  const out = [];
  for (const m of css.matchAll(/(?:^|[;{\s])transition(?:-property)?\s*:\s*([^;}]+)/g)) {
    const v = m[1].trim();
    // shorthand: comma-separated layers, first token is the property; transition-property: plain list
    for (const layer of v.split(/,(?![^(]*\))/)) {
      const t = layer.trim().split(/\s+/)[0];
      if (t && !/^(none|[\d.]+m?s|var\(.*)/.test(t)) out.push(t);
    }
  }
  return out;
}

test("no layout or filter properties are transitioned", () => {
  const bad = transitionProps().filter((p) => FORBIDDEN.test(p));
  assert.deepEqual(bad, []);
});

test("animation shorthands never name layout or filter properties", () => {
  const bad = [...css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)].map((m) => m[1]).filter((v) => /\b(max-width|min-height|padding|width|height|margin|filter|blur)\b/.test(v));
  assert.deepEqual(bad, []);
});

test("transitions are transform, opacity or allowlisted paint properties", () => {
  const ok = new Set(["transform", "opacity", ...PAINT_ALLOWLIST]);
  const unknown = transitionProps().filter((p) => !ok.has(p) && !FORBIDDEN.test(p));
  assert.deepEqual(unknown, []);
});

test("every @keyframes block animates only transform and opacity", () => {
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m;
  const bad = [];
  while ((m = re.exec(css))) {
    let depth = 1, i = re.lastIndex;
    while (depth && i < css.length) depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0, i++;
    const body = css.slice(re.lastIndex, i - 1);
    for (const d of body.matchAll(/([\w-]+)\s*:[^;{}]+;?(?=[^{]*\})/g)) {
      if (!["transform", "opacity", "animation-timing-function"].includes(d[1])) bad.push(`${m[1]}: ${d[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});
