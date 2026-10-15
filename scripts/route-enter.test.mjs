// The route wrapper's entrance starts after hydration: the default state has no animation, and the animation class is
// added in an effect. The keyframes move only (no opacity 0), so a page at rest is fully visible.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const css = read("src/styles.css").replace(/\/\*[\s\S]*?\*\//g, "");
const component = read("src/components/route-enter.tsx");
const rootRoute = read("src/routes/__root.tsx");

const rulesFor = (selector) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, sel]) => sel.split(",").some((s) => s.trim() === selector)).map(([, , body]) => body);

test("the default route wrapper has no animation and no opacity", () => {
  for (const body of rulesFor(".route-enter")) assert.doesNotMatch(body, /animation|opacity/);
});

test("the entrance animation is only on the class added after mount, and reduced motion turns it off", () => {
  const on = rulesFor(".route-enter-on");
  assert.ok(on.some((b) => /animation:\s*route-enter\b/.test(b)), "route-enter-on carries the animation");
  assert.ok(rulesFor(".route-enter-on").every((b) => !/opacity/.test(b)));
  assert.match(css, /\.route-enter-on,\s*\.hero-on \.hero-rise,\s*\.enter-on \.rise,\s*\.mobile-nav\s*\{\s*animation:\s*none/);
});

test("the route-enter keyframes move only; they never fade from opacity 0", () => {
  const m = css.match(/@keyframes route-enter\s*\{([\s\S]*?)\n\}/);
  assert.ok(m, "keyframes present");
  assert.doesNotMatch(m[1], /opacity/);
  assert.match(m[1], /transform/);
});

test("the wrapper starts without the animation class and adds it in an effect", () => {
  assert.match(component, /useState\(false\)/);
  assert.match(component, /useEffect\(\(\) => \{\s*setEntering\(true\);\s*\}, \[\]\)/);
  assert.match(component, /entering && "route-enter-on"/);
});

test("the root renders the gated wrapper, not a static class", () => {
  assert.match(rootRoute, /<RouteEnter key=\{routeKey\}>/);
  assert.doesNotMatch(rootRoute, /className="route-enter"/);
});

test("the shared entrance moves transform only and starts from a hook that is false on first render", () => {
  const hook = read("src/lib/use-entering.ts");
  assert.match(hook, /useState\(false\)/);
  assert.match(hook, /useEffect\(\(\) => \{\s*setEntering\(true\);\s*\}, \[\]\)/);
  for (const body of rulesFor(".enter-on .rise")) assert.doesNotMatch(body, /opacity/);
  assert.equal(rulesFor(".rise").length, 0, "no animation on .rise outside .enter-on");
});
