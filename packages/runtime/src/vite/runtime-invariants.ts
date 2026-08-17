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
 * `build.assetsInlineLimit` callback that prevents `.wasm` files from being
 * inlined as base64 data URLs. Inlining breaks worker-side V8 bytecode caching
 * — workers must fetch each WASM file as its own response so the browser/Node
 * can cache the compiled module.
 *
 * Returning `undefined` for non-WASM assets defers to Vite's default (4 KB)
 * threshold, leaving consumer overrides intact.
 *
 * @internal
 *
 * @param filePath - The asset path Vite is asking us to classify.
 *
 * @returns `false` for `.wasm` (forces emission as a separate file), or
 *   `undefined` to defer to the default threshold for any other asset.
 */
export const wasmAssetsInlineLimit = (filePath: string): false | undefined =>
  filePath.endsWith('.wasm') ? false : undefined;
