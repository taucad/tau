/**
 * Browser counterpart of `node-evidence-store.ts`, selected by the `browser`
 * condition on the `#cache/node-evidence-store.js` internal import.
 *
 * A browser has no filesystem evidence store, so it installs no default
 * factory: with no store the evidence cache computes directly, which is the
 * core's documented fail-open contract (Register C5). The Node module is not
 * merely unused here — it must be *unreachable*, or a browser bundler resolves
 * `node:fs` and the build fails.
 *
 * @module
 */

/**
 * No-op: the browser has no filesystem store to install.
 *
 * @public
 */
export const ensureNodeEvidenceStoreInstalled = (): void => {
  // Intentionally empty — see the module docstring.
};
