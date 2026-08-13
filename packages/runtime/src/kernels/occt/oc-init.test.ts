// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { initOcct } from '#kernels/occt/oc-init.js';
import type { OcctModuleFactory } from '#kernels/occt/oc-init.js';

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
});
