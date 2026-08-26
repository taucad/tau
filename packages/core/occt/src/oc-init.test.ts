// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { initOcct, resolveOcctModuleFactory } from '#oc-init.js';
import type { OcctModuleFactory } from '#oc-init.js';

describe('initOcct', () => {
  it('lets the initializer own instantiation while resolving its WASM URL', async () => {
    let receivedOptions: Record<string, unknown> | undefined;
    const initializer: OcctModuleFactory<{ ready: true }> = async (options) => {
      receivedOptions = options;
      return { ready: true };
    };
    const wasmUrl = 'data:application/wasm;base64,AGFzbQEAAAA=';

    await expect(initOcct(wasmUrl, initializer)).resolves.toEqual({ ready: true });

    const locateFile = receivedOptions?.['locateFile'];
    expect(locateFile).toBeTypeOf('function');
    expect((locateFile as (path: string, directory: string) => string)('module.wasm', '/package/')).toBe(wasmUrl);
    expect((locateFile as (path: string, directory: string) => string)('worker.js', '/package/')).toBe(
      '/package/worker.js',
    );
    expect(receivedOptions).not.toHaveProperty('instantiateWasm');
  });

  it('instantiates a supplied compiled module through the Emscripten hook', async () => {
    const compiledModule = await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    let receivedModule: WebAssembly.Module | undefined;
    const initializer: OcctModuleFactory<{ ready: true }> = async (options) => {
      await new Promise<void>((resolve) => {
        options?.instantiateWasm?.({}, (_instance, module) => {
          receivedModule = module;
          resolve();
        });
      });
      return { ready: true };
    };

    await expect(initOcct('module.wasm', initializer, { compiledModule })).resolves.toEqual({ ready: true });
    expect(receivedModule).toBe(compiledModule);
  });

  it('propagates compiled-module instantiation failures', async () => {
    const compiledModule = await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    const failure = new Error('instantiate failed');
    const instantiateSpy = vi.spyOn(WebAssembly, 'instantiate').mockRejectedValue(failure);
    const initializer: OcctModuleFactory<never> = async (options) => {
      return new Promise<never>(() => {
        options?.instantiateWasm?.({}, () => undefined);
      });
    };

    await expect(initOcct('module.wasm', initializer, { compiledModule })).rejects.toBe(failure);
    instantiateSpy.mockRestore();
  });
});

describe('resolveOcctModuleFactory', () => {
  it('unwraps a nested default and rejects non-callable modules', async () => {
    const initializer: OcctModuleFactory<{ ready: true }> = async () => ({ ready: true });
    expect(await resolveOcctModuleFactory<{ ready: true }>({ default: { default: initializer } })()).toEqual({
      ready: true,
    });
    expect(() => resolveOcctModuleFactory({ default: {} })).toThrow(/callable default export/u);
  });
});
