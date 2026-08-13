/* eslint-disable @typescript-eslint/naming-convention -- `HEAPF64` is the Emscripten module's own name. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTriangleSoup, getOpenCascadeStepModule, resetOpenCascadeStepModule } from '#native/opencascade-module.js';
import type { GeoSpecNativeStepBackend } from '#step/types.js';

afterEach(() => {
  resetOpenCascadeStepModule();
});

describe('OCCT module adapter', () => {
  it('should hand every caller the same process-wide module', async () => {
    const first = await getOpenCascadeStepModule();
    const second = await getOpenCascadeStepModule();

    expect(second).toBe(first);
    expect(first.GeoSpecXdeReader).toBeDefined();
  }, 120_000);

  it('should suppress both native output channels', async () => {
    const backend = { HEAPF64: new Float64Array(0) } as unknown as GeoSpecNativeStepBackend;
    vi.doMock('@taucad/geospec-engine/native/opencascade/single', () => ({
      default: async (options?: { print?: () => void; printErr?: () => void }) => {
        const print = options?.print;
        const printError = options?.printErr;
        if (typeof print !== 'function' || typeof printError !== 'function') {
          throw new TypeError('Expected OpenCascade print callbacks');
        }
        print();
        printError();
        return backend;
      },
    }));
    vi.resetModules();
    try {
      const adapter = await import('#native/opencascade-module.js');
      expect(await adapter.getOpenCascadeStepModule()).toBe(backend);
    } finally {
      vi.doUnmock('@taucad/geospec-engine/native/opencascade/single');
    }
  });

  it('should copy a triangle soup out of the heap without aliasing it', () => {
    const module_: GeoSpecNativeStepBackend = { HEAPF64: new Float64Array([0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) };

    const copy = copyTriangleSoup(module_, 16, 1);

    expect([...copy]).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    module_.HEAPF64[2] = 99;
    expect(copy[0]).toBe(1);
    expect([...copyTriangleSoup(module_, 0, 0)]).toStrictEqual([]);
  });
});
