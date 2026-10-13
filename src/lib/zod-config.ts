import { z } from "zod";

/**
 * Zod probes `Function("")` to decide whether it may JIT-compile validators. Our CSP has no 'unsafe-eval', so in the
 * browser that harmless probe is reported as a `script-src eval` violation on every page (it is caught and falls
 * back, so nothing breaks). The validators here are tiny: skip the probe in the browser. The server keeps JIT.
 * Call it in every module that builds schemas at load time (a bare side-effect import is dropped: package.json has
 * "sideEffects": false), before the first schema is created.
 */
export function configureZod(): void {
  if (typeof window !== "undefined") z.config({ jitless: true });
}
