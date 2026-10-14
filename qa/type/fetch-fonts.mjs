// Fetch Latin-subset WOFF2 files from the Google Fonts CSS2 API for the type candidates (all OFL 1.1).
// Each entry is one axis combination; the CSS2 API subsets to the latin unicode-range.
import { writeFileSync, mkdirSync } from "node:fs";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const dir = new URL("./fonts/", import.meta.url);
mkdirSync(dir, { recursive: true });
const specs = [
  ["fraunces-opsz-wght-400-700", "Fraunces:opsz,wght@9..144,400..700"],
  ["fraunces-opsz-wght-100-900", "Fraunces:opsz,wght@9..144,100..900"],
  ["fraunces-opsz-wght-soft-400-700", "Fraunces:opsz,wght,SOFT@9..144,400..700,0..100"],
  ["fraunces-opsz-wght-soft-wonk-400-700", "Fraunces:opsz,wght,SOFT,WONK@9..144,400..700,0..100,0..1"],
  ["instrument-sans-wdth-wght", "Instrument+Sans:wdth,wght@75..100,400..700"],
  ["hanken-grotesk-wght-400-700", "Hanken+Grotesk:wght@400..700"],
];
const manifest = [];
for (const [name, family] of specs) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
  const css = await (await fetch(cssUrl, { headers: { "User-Agent": UA } })).text();
  // Pick the block whose comment is "latin" (the subset with the basic Latin unicode-range).
  const block = css.split("}").find((b) => /\/\* latin \*\//.test(b));
  const url = block?.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
  if (!url) throw new Error(`no latin woff2 for ${name}`);
  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(new URL(`${name}.woff2`, dir), bytes);
  manifest.push({ name, cssUrl, fileUrl: url, bytes: bytes.length, license: "SIL OFL 1.1" });
  console.log(name.padEnd(40), String(bytes.length).padStart(7), "bytes");
}
writeFileSync(new URL("manifest.json", dir), JSON.stringify(manifest, null, 2));
