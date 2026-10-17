// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  environment: 'worker' as 'worker' | 'browser',
  initialize: vi.fn(async () => undefined),
}));

vi.mock('#vm/environment.js', () => ({
  getEnvironment: () => mocks.environment,
  isNode: () => false,
}));
vi.mock('#vm/esbuild-wasm-url.js', () => ({ esbuildWasmUrl: 'https://tau.test/esbuild.wasm' }));
vi.mock('esbuild-wasm', () => ({ initialize: mocks.initialize }));

describe('esbuild-wasm initialization off Node', () => {
  afterEach(() => {
    vi.resetModules();
    mocks.initialize.mockClear();
  });

  it('should run esbuild on the runtime worker thread instead of nesting another worker', async () => {
    mocks.environment = 'worker';
    const { initializeEsbuild } = await import('#vm/esbuild-core.js');

    await initializeEsbuild();

    expect(mocks.initialize).toHaveBeenCalledExactlyOnceWith({
      wasmURL: 'https://tau.test/esbuild.wasm',
      worker: false,
    });
  });

  it("should keep esbuild's own worker on a browser main thread", async () => {
    mocks.environment = 'browser';
    const { initializeEsbuild } = await import('#vm/esbuild-core.js');

    await initializeEsbuild();

    expect(mocks.initialize).toHaveBeenCalledExactlyOnceWith({ wasmURL: 'https://tau.test/esbuild.wasm' });
  });
});
