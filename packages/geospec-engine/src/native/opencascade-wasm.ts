/**
 * Package-owned URL for the GeoSpec single-threaded OCCT artifact.
 *
 * `import.meta.resolve` of the package's own `…/single/wasm` subpath is the one
 * form that survives every layout: Node resolves the self-reference through
 * `exports` (source) or `publishConfig.exports` (published), and bundlers
 * rewrite the whole `new URL(import.meta.resolve('<literal>'))` expression to
 * the asset they emit. A relative `new URL(…, import.meta.url)` cannot do that:
 * the wasm sits at a different depth in the two layouts, and the branch a
 * bundler rewrites is not the branch a bundled module takes at runtime.
 *
 * @public
 */
export const openCascadeWasmUrl = new URL(import.meta.resolve('@taucad/geospec-engine/native/opencascade/single/wasm'))
  .href;
