/**
 * OCCT wasm module adapter.
 *
 * One ~13 MB module per process (register row "OCCT singleton"). The module is
 * a shared heap: **never `await` between a native call and the HEAPF64 copy of
 * its result** — any interleaved call can grow or reallocate the heap and
 * invalidate the pointer. {@link copyTriangleSoup} is the only sanctioned
 * copy-out and is deliberately synchronous.
 * @module
 */

import type { GeoSpecNativeStepBackend } from '#step/types.js';
import { openCascadeWasmUrl } from '#native/opencascade-wasm.js';
import { initOcct } from '@taucad/occt-core';
import type { OcctModuleFactory } from '@taucad/occt-core';

let singleton: Promise<GeoSpecNativeStepBackend> | undefined;
let compiledModule: WebAssembly.Module | undefined;

const instantiate = async (): Promise<GeoSpecNativeStepBackend> => {
  // The specifier must stay a literal. Bundlers follow it into the subpath's
  // `init.js`, whose `new URL('./geospec_opencascade_single.js',
  // import.meta.url)` emits the glue as an asset; Node resolves the same string
  // as a package self-reference. A variable specifier (or `@vite-ignore`)
  // leaves the bare string in the bundle, and no browser can resolve that
  // without an import map. `tsdown.config.ts` (`deps.neverBundle`) keeps the
  // subpath external in the published build.
  const module_ = (await import('@taucad/geospec-engine/native/opencascade/single')) as unknown as {
    default: OcctModuleFactory<GeoSpecNativeStepBackend>;
  };
  // No `variant` option: the assembly is built single-only
  // (`native/opencascade/libcascade.config.ts`), so the subpath's `init.js` has
  // exactly one variant to hand back and no capability probe to run.
  //
  // The wasm URL is not optional once a bundler is involved: it fingerprints
  // the glue and the binary independently, so the glue can no longer find its
  // sibling and needs `initOcct`'s `locateFile`. In Node it resolves to the
  // same file the glue would have found anyway.
  //
  // Suppress OCCT messenger chatter; structured host events own observability
  // and JSON output must remain valid.
  return initOcct(openCascadeWasmUrl, module_.default, {
    ...(compiledModule ? { compiledModule } : {}),
    print: () => undefined,
    printErr: () => undefined,
  });
};

/** Install the host-compiled module before the worker's first STEP load. */
export const setOpenCascadeCompiledModule = (module: WebAssembly.Module): void => {
  if (singleton) {
    throw new Error('The GeoSpec OCCT module is already initialized.');
  }
  compiledModule = module;
};

/**
 * Resolve the process-wide OCCT module.
 *
 * @returns The initialized native backend.
 * @public
 */
export const getOpenCascadeStepModule = async (): Promise<GeoSpecNativeStepBackend> => {
  singleton ??= instantiate();
  return singleton;
};

/**
 * Drop the memoized module so the next call rebuilds it. Test support only —
 * the wasm instance itself is not reclaimable.
 *
 * @public
 */
export const resetOpenCascadeStepModule = (): void => {
  singleton = undefined;
  compiledModule = undefined;
};

/**
 * Copy a retained triangle soup out of the wasm heap.
 *
 * Synchronous by contract: the pointer is only valid until the next native
 * call, so no `await` may separate the producing call from this copy.
 *
 * @param module_ - The module owning the heap.
 * @param pointer - Byte offset of the retained `double[]`.
 * @param triangleCount - Number of triangles (9 doubles each).
 * @returns An owned copy of the soup.
 * @public
 */
export const copyTriangleSoup = (
  module_: GeoSpecNativeStepBackend,
  pointer: number,
  triangleCount: number,
): Float64Array => {
  const length = triangleCount * 9;
  const out = new Float64Array(length);
  const start = pointer / 8;
  const heap = module_.HEAPF64;
  for (let index = 0; index < length; index++) {
    out[index] = heap[start + index]!;
  }
  return out;
};
