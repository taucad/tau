/**
 * Bundler invariants required for `@taucad/runtime` to ship its WASM, font,
 * and dynamically-imported plugin chunks transparently.
 *
 * Used by the Vite plugin (`@taucad/runtime/vite`).
 *
 * @see docs/research/runtime-zero-config-bundling.md (R2, R6)
 */

/**
 * Runtime root packages that ship `new URL(literal, import.meta.url)` asset
 * references. Build adapters use these roots when the host build tool would
 * otherwise externalize runtime source before it can emit those assets.
 *
 * Kept as a tuple so resolved Vite configs are deeply readonly and regression
 * tests can assert exact membership.
 *
 * @internal
 */
export const runtimePackages = ['@taucad/runtime'] as const;
