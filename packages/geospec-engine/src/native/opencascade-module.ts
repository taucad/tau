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

const nativeEntry = '@taucad/geospec-engine/native/opencascade/single';

let singleton: Promise<GeoSpecNativeStepBackend> | undefined;

const instantiate = async (): Promise<GeoSpecNativeStepBackend> => {
  const module_ = (await import(/* @vite-ignore */ nativeEntry)) as {
    default: (options?: Record<string, unknown>) => Promise<GeoSpecNativeStepBackend>;
  };
  // Suppress OCCT messenger chatter; structured host events own observability
  // and JSON output must remain valid.
  return module_.default({ print: () => undefined, printErr: () => undefined });
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
