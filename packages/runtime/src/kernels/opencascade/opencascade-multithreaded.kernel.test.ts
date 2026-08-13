// @vitest-environment node
/* oxlint-disable eslint(new-cap) -- OpenCascade API uses PascalCase method names */
/* eslint-disable new-cap -- OpenCascade embind exposes PascalCase factory functions. */
/* eslint-disable @typescript-eslint/naming-convention -- OCCT C++ classes/methods use PascalCase; fixture filenames use extensions */
import { describe, it, expect, beforeAll } from 'vitest';
import { opencascade as opencascadeKernel } from '#kernels/opencascade/opencascade.kernel.js';
import { getModuleRegistry } from '#kernels/kernel-module-helpers.js';
import { assertSuccess, createGeometryFile, createTestWorker } from '#testing/kernel-testing.utils.js';
import { createGeometryTestHelpers } from '#testing/kernel-geometry-testing.utils.js';

// =============================================================================
// Multi-threaded (pthread) OpenCascade kernel coverage
// =============================================================================
//
// RED-STATE TDD — these tests intentionally FAIL today.
//
// The `wasm: 'multi'` option resolves the pthread bindings from the published
// `libcascade/multi` subpath. The OCJS glue module now owns its adjacent
// WASM asset URL so framework bundlers emit a single copy instead of seeing a
// second `@taucad/runtime`-owned static URL.
//
// The assertions below describe the REAL multi-threaded behaviour, so once the
// asset ships they go green with no further code changes: the kernel boots the
// pthread build, `activateOccParallelism` flips OCCT's global parallel defaults,
// and the OCCT default thread pool reports more than one worker.
//
// (The single-threaded suite lives in `opencascade.kernel.test.ts`.)
// =============================================================================

const geometryHelpers = createGeometryTestHelpers();

/** Minimal structural view of the OCCT parallelism statics asserted below. */
type OccParallelProbe = {
  BOPAlgo_Options: { GetParallelMode(): boolean };
  OSD_ThreadPool: { DefaultPool(threadCount: number): { NbThreads(): number } };
};

/**
 * Read the OCCT parallelism statics off the in-process module registry. The
 * kernel registers its (exception-wrapped) OpenCascade instance under
 * `'libcascade'`, and the global parallel mode set during init is observable
 * through it.
 *
 * @returns the registered instance narrowed to the parallelism statics
 */
function readParallelProbe(): OccParallelProbe {
  const oc = getModuleRegistry().get('libcascade') as OccParallelProbe | undefined;
  expect(oc, 'expected worker to have registered libcascade module').toBeDefined();
  return oc!;
}

describe('OpenCascade Kernel (multi-threaded)', { timeout: 60_000 }, () => {
  let worker: Awaited<ReturnType<typeof createTestWorker>>;

  beforeAll(async () => {
    worker = await createTestWorker(
      opencascadeKernel,
      {
        'box.ts': `
import { BRepPrimAPI_MakeBox } from 'libcascade';
export default function main() {
  return new BRepPrimAPI_MakeBox(10, 20, 30).Shape();
}`,
      },
      { workerOptions: { wasm: 'multi', ocTracing: 'off' } },
    );
  });

  it('initialises the pthread build and renders valid GLTF', async () => {
    const result = await worker.createGeometry({ file: createGeometryFile('box.ts'), parameters: {} });
    assertSuccess(result, 'multi-threaded box createGeometry');
    await geometryHelpers.expectValidGltf(result);
  });

  it('activates OCCT global parallel mode after init', () => {
    const oc = readParallelProbe();
    // The single-threaded kernel never calls activateOccParallelism, so `true`
    // here is unique to the multi-threaded path's parallel activation.
    expect(oc.BOPAlgo_Options.GetParallelMode()).toBe(true);
  });

  it('sizes the OCCT default thread pool to more than one worker', () => {
    const oc = readParallelProbe();
    const pool = oc.OSD_ThreadPool.DefaultPool(-1);
    // The pthread pool is backed by PTHREAD_POOL_SIZE / NbLogicalProcessors; a
    // multi-core host reporting > 1 is the observable signature of the pthread
    // build (the single-threaded build cannot spawn real worker threads).
    expect(pool.NbThreads()).toBeGreaterThan(1);
  });
});
