/**
 * Shared OpenCascade WASM module loader.
 *
 * One 13 MB Emscripten compile + instantiate per process, shared by every
 * OpenCascade consumer (STEP XDE reads, chamfer mesh metrics). Mirrors the
 * Manifold singleton (`mesh/manifold-module.ts`): the import is dynamic so
 * subpaths that merely type against the backend never pull the glue into
 * their static graph, and the memoized promise makes availability
 * deterministic — ready or permanently failed, never timing-dependent.
 *
 * Shared-heap invariant: every native call that exposes a transient heap
 * pointer must be followed SYNCHRONOUSLY by its `HEAPF64` copy — no `await`
 * may ever be introduced between the native call and the slice. With one
 * module per process this is a cross-subject safety invariant, not a local
 * style rule: an interleaved call from another subject would overwrite the
 * transient buffer.
 *
 * Reader lifetime: subjects own their `XdeReader` handles; the resource scope
 * that tracks a subject disposes its reader (`resource-scope.ts`). Without
 * that, readers would accumulate in this module's monotonic heap for the
 * process lifetime.
 *
 * `GEOSPEC_NATIVE_SINGLETON=0` restores per-call module construction.
 *
 * @module
 */

let modulePromise: Promise<unknown> | undefined;

const singletonDisabled = (): boolean => {
  if (typeof process === 'undefined' || typeof process.env !== 'object') {
    return false;
  }
  return process.env['GEOSPEC_NATIVE_SINGLETON'] === '0';
};

// `geospec/native/opencascade/single` resolves to the `createInstance` factory
// `libcascade assemble` generates next to the artifacts — it owns variant
// selection and the glue's own asset URL, so nothing here reaches for the raw
// Emscripten module factory.
const instantiate = async (): Promise<unknown> => {
  const module_ = await import('geospec/native/opencascade/single');
  const createInstance = module_.default as (options?: unknown) => Promise<unknown>;
  return createInstance();
};

/**
 * Initialize (once) and return the shared OpenCascade WASM module.
 *
 * Rejects when the native bundle is unavailable; callers map that to
 * `undefined`. The rejection is memoized, so availability is a stable
 * per-process fact rather than a per-call race.
 *
 * @returns The initialized OpenCascade module.
 * @public
 */
export const ensureOpenCascadeModule = async (): Promise<unknown> => {
  if (singletonDisabled()) {
    return instantiate();
  }
  modulePromise ??= instantiate();
  return modulePromise;
};
