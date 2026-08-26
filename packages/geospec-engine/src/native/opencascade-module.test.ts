/* eslint-disable @typescript-eslint/naming-convention -- `HEAPF64` is the Emscripten module's own name. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyTriangleSoup,
  getOpenCascadeStepModule,
  resetOpenCascadeStepModule,
  setOpenCascadeCompiledModule,
} from '#native/opencascade-module.js';
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

  it('should let the single-only assembly pick its own variant', async () => {
    let received: Record<string, unknown> | undefined;
    vi.doMock('@taucad/geospec-engine/native/opencascade/single', () => ({
      default: async (options?: Record<string, unknown>) => {
        received = options;
        return { HEAPF64: new Float64Array(0) } as unknown as GeoSpecNativeStepBackend;
      },
    }));
    vi.resetModules();
    try {
      const adapter = await import('#native/opencascade-module.js');
      await adapter.getOpenCascadeStepModule();
    } finally {
      vi.doUnmock('@taucad/geospec-engine/native/opencascade/single');
    }

    // The subpath resolves to `init.js`, and the assembly declares one variant,
    // so `selectVariant()` can only return `single`. Naming it here would be a
    // second source of truth for something `libcascade.config.ts` already
    // decides. The real module is only instantiated by the suite's first test,
    // so this mock is what pins the option shape.
    expect(received).toBeDefined();
    expect(Object.hasOwn(received ?? {}, 'variant')).toBe(false);
  });

  it('should instantiate a host-compiled module without recompiling it', async () => {
    const compiled = await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    const backend = { HEAPF64: new Float64Array(0) } as unknown as GeoSpecNativeStepBackend;
    const compileSpy = vi.spyOn(WebAssembly, 'compile');
    vi.doMock('@taucad/geospec-engine/native/opencascade/single', () => ({
      default: async (options?: {
        instantiateWasm?: (
          imports: WebAssembly.Imports,
          receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
        ) => WebAssembly.Exports;
      }) => {
        await new Promise<void>((resolve) => {
          options?.instantiateWasm?.({}, (_instance, module) => {
            expect(module).toBe(compiled);
            resolve();
          });
        });
        return backend;
      },
    }));
    vi.resetModules();
    try {
      const adapter = await import('#native/opencascade-module.js');
      adapter.setOpenCascadeCompiledModule(compiled);
      expect(await adapter.getOpenCascadeStepModule()).toBe(backend);
      expect(compileSpy).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('@taucad/geospec-engine/native/opencascade/single');
      compileSpy.mockRestore();
    }
  });

  it('should reject changing the prepared module after initialization starts', async () => {
    await getOpenCascadeStepModule();
    const compiled = await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));

    expect(() => {
      setOpenCascadeCompiledModule(compiled);
    }).toThrow(/already initialized/u);
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
