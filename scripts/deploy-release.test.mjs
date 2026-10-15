import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { join } from "node:path";
import { test } from "node:test";

const SCRIPT = new URL("./deploy-release.sh", import.meta.url).pathname;
const CHAIN = "61997";
const CONTRACT = "0x4105A7ccAef5072eb5A3A3C9142CD28F52c38703";
const git = (cwd, ...a) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd, encoding: "utf8" }).trim();

// A dummy production repo (tag v1, output OLD), a release clone (tag v2, output NEW), a backup as the backup step writes it,
// a pm2 stub whose restart counter lives in a file, and a cp wrapper that can fail copies out of the release dir.
function world() {
  const w = mkdtempSync(join(tmpdir(), "deploy-release-"));
  const prod = join(w, "prod"), rel = join(w, "rel"), bk = join(w, "bk"), bin = join(w, "bin");
  mkdirSync(prod); mkdirSync(bk); mkdirSync(bin);
  git(prod, "init", "-q");
  writeFileSync(join(prod, ".gitignore"), ".vercel\nnode_modules\n");
  writeFileSync(join(prod, "app.txt"), "v1");
  mkdirSync(join(prod, ".vercel/output"), { recursive: true });
  writeFileSync(join(prod, ".vercel/output/marker"), "OLD");
  git(prod, "add", "."); git(prod, "commit", "-qm", "v1"); git(prod, "tag", "v1");
  git(w, "clone", "-q", prod, rel);
  writeFileSync(join(rel, "app.txt"), "v2"); git(rel, "commit", "-qam", "v2"); git(rel, "tag", "v2");
  mkdirSync(join(rel, ".vercel/output"), { recursive: true });
  writeFileSync(join(rel, ".vercel/output/marker"), "NEW");
  git(prod, "fetch", "-q", rel, "tag", "v2");
  writeFileSync(join(bk, "last-ts"), "TS1");
  writeFileSync(join(bk, "start-commit"), git(prod, "rev-parse", "HEAD"));
  cpSync(join(prod, ".vercel/output"), join(bk, "vercel-output-TS1"), { recursive: true });
  writeFileSync(join(w, "count"), "0");
  writeFileSync(join(w, "ready.json"), JSON.stringify({ status: "ready", chainId: Number(CHAIN), contractAddress: CONTRACT }));
  writeFileSync(join(bin, "pm2"), `#!/bin/sh
echo "pm2 $*" >> "${w}/pm2.log"
case "$1" in
  restart)
    [ -n "$FAIL_RESTART_ALWAYS" ] && exit 1
    if [ -n "$FAIL_RESTART_FIRST" ] && [ ! -e "${w}/failed" ]; then touch "${w}/failed"; exit 1; fi
    [ -n "$NO_BUMP" ] || echo $(( $(cat "${w}/count") + 1 )) > "${w}/count" ;;
  jlist) echo "[{\\"name\\":\\"app\\",\\"pm2_env\\":{\\"restart_time\\":$(cat "${w}/count")}}]" ;;
esac
`);
  writeFileSync(join(bin, "cp"), `#!/bin/sh
case "$*" in *"${rel}"*) [ -n "$FAIL_CP" ] && { echo "cp: injected failure" >&2; exit 1; } ;; esac
exec /usr/bin/cp "$@"
`);
  chmodSync(join(bin, "pm2"), 0o755); chmodSync(join(bin, "cp"), 0o755);
  return { w, prod, rel, bk, bin };
}

function run(env = {}, opts = {}) {
  const x = world();
  const args = [SCRIPT, x.rel, "v2", "--prod", x.prod, "--backups", x.bk, "--pm2", join(x.bin, "pm2"), "--app", "app",
    "--ready-url", `file://${x.w}/ready.json`, "--chain", opts.chain ?? CHAIN, "--contract", CONTRACT];
  const r = spawnSync("bash", args, { encoding: "utf8", env: { PATH: `${x.bin}:${dirname(process.execPath)}:/usr/bin:/bin`, HOME: x.w, READY_TRIES: "2", READY_SLEEP: "0", ...env } });
  const out = r.stdout + r.stderr;
  const state = {
    code: r.status, out, head: git(x.prod, "log", "-1", "--format=%s"),
    output: readFileSync(join(x.prod, ".vercel/output/marker"), "utf8"),
    prev: existsSync(join(x.prod, ".vercel/output.prev-TS1")),
    restarts: existsSync(join(x.w, "pm2.log")) ? readFileSync(join(x.w, "pm2.log"), "utf8").split("\n").filter((l) => l.startsWith("pm2 restart")).length : 0,
    rollbacks: out.split("rolling back").length - 1,
  };
  rmSync(x.w, { recursive: true, force: true });
  return state;
}

const rolledBack = (s, restarts) => {
  assert.equal(s.code, 1); assert.equal(s.rollbacks, 1); assert.equal(s.head, "v1");
  assert.equal(s.output, "OLD"); assert.equal(s.restarts, restarts); assert.match(s.out, /rolled back/);
};

test("success: new tag and output, one restart, previous output kept", () => {
  const s = run();
  assert.equal(s.code, 0); assert.equal(s.head, "v2"); assert.equal(s.output, "NEW");
  assert.equal(s.restarts, 1); assert.equal(s.rollbacks, 0); assert.equal(s.prev, true); assert.match(s.out, /DEPLOYED v2/);
});
test("a failing copy rolls back once", () => rolledBack(run({ FAIL_CP: "1" }), 1));
test("a failing restart rolls back once", () => rolledBack(run({ FAIL_RESTART_FIRST: "1" }), 2));
test("a restart counter that does not move rolls back once", () => rolledBack(run({ NO_BUMP: "1" }), 2));
test("a wrong chain in the ready payload rolls back once", () => rolledBack(run({}, { chain: "1" }), 2));
test("a failing rollback exits 2 without looping", () => {
  const s = run({ FAIL_CP: "1", FAIL_RESTART_ALWAYS: "1" });
  assert.equal(s.code, 2); assert.equal(s.rollbacks, 1); assert.match(s.out, /ROLLBACK INCOMPLETE/);
});
test("DATABASE_URL set aborts in preflight and changes nothing", () => {
  const s = run({ DATABASE_URL: "x" });
  assert.equal(s.code, 3); assert.equal(s.head, "v1"); assert.equal(s.output, "OLD"); assert.equal(s.restarts, 0); assert.equal(s.prev, false);
});
