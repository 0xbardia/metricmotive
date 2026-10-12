import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { LANDING_SECTIONS, OG_IMAGE, SITE_DESCRIPTION, SITE_TAGLINE, pageHead } from "./site.ts";

describe("public page identity", () => {
  it("uses ONE description sentence in the manifest (and the head helper)", () => {
    const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
    assert.equal(manifest.description, SITE_DESCRIPTION);
    assert.match(SITE_DESCRIPTION, /\.$/);
    assert.equal(SITE_DESCRIPTION.split(/(?<=\.)\s/).length, 1, "exactly one sentence");
    const head = pageHead({ path: "/" });
    assert.ok(head.meta.some((m) => "name" in m && m.name === "description" && m.content === SITE_DESCRIPTION));
  });

  it("emits canonical, robots, og:* and twitter:* for every page", () => {
    const head = pageHead({ title: "Docs", path: "/docs" });
    const props = Object.fromEntries(head.meta.map((m) => [("property" in m ? m.property : "name" in m ? m.name : "title") as string, ("content" in m ? m.content : (m as { title: string }).title) as string]));
    assert.equal(props.title, "Docs · MetricMotive");
    assert.equal(props["og:image"], OG_IMAGE);
    assert.equal(props["twitter:card"], "summary_large_image");
    assert.equal(props.robots, "index,follow");
    assert.equal(head.links[0].href, "https://metricmotive.xyz/docs");
    assert.equal(pageHead({ path: "/" }).links[0].href, "https://metricmotive.xyz");
    assert.equal(pageHead({ path: "/" }).meta[0].title, `MetricMotive: ${SITE_TAGLINE}`);
  });

  it("ships the share image the tags point at", () => {
    assert.ok(statSync("public/og.jpg").size > 10_000);
  });

  it("names landing sections so nav labels equal section titles (C-07)", () => {
    assert.deepEqual(LANDING_SECTIONS.map((s) => s.title), ["The problem", "A real case", "How it works", "Who it's for", "Trust"]);
  });
});
