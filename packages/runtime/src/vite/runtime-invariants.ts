/**
 * Bundler invariants required for `@taucad/runtime` to ship its WASM, font,
 * and dynamically-imported plugin chunks transparently.
 *
 * Used by the Vite plugin (`@taucad/runtime/vite`) and the Rolldown plugin
 * (`@taucad/runtime/rolldown`) so consumers of either bundler get identical
 * behaviour from a single import.
 *
 * @see docs/research/runtime-zero-config-bundling.md (R2, R6)
 */

/**
 * Runtime root packages that ship `new URL(literal, import.meta.url)` asset
 * references. Build adapters use these roots when the host build tool would
 * otherwise externalize runtime source before it can emit those assets.
 *
 * Kept as a tuple so the resolved Vite/Rolldown configs are deeply readonly
 * and the regression tests can assert exact membership.
 *
 * @internal
 */
export const runtimePackages = ['@taucad/runtime', '@taucad/openscad'] as const;

/**
 * Third-party packages whose WASM binaries the runtime forwards via
 * `new URL`. Library-oriented Rolldown builds keep these dependencies
 * external so their package-owned assets remain addressable. The list mirrors
 * [Appendix A](../../docs/research/runtime-zero-config-bundling.md#appendix-a-runtime-asset-inventory)
 * of the bundling research doc.
 *
 * @internal
 */
export const wasmBearingDeps = [
  'replicad-opencascadejs',
  'libcascade',
  'manifold-3d',
  '@kittycad/lib',
  'esbuild-wasm',
  'openscad-wasm-prebuilt',
] as const;

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
