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

/**
 * Kernel loader entries that find their Emscripten glue with
 * `new URL('./<glue>.js', import.meta.url)` and import it at run time. Vite's
 * dependency optimizer copies such an entry into `.vite/deps/` without the
 * glue beside it, so the development server answers the glue with a 404.
 * Excluded from optimization, the entry is served from its package and the
 * glue resolves next to it.
 *
 * @internal
 */
export const kernelGlueLoaders = [
  'libcascade/init',
  'libcascade/multi/init',
  'libcascade/single/init',
  'replicad-opencascadejs/multi/init',
  'replicad-opencascadejs/single/init',
] as const;
