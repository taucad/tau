import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createMockKernelRuntime } from '@taucad/runtime-testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { picogkBrowserKernel, picogkBrowserOptionsSchema } from '@taucad/picogk/browser';
import { loadPicogkBrowserAssets } from '#picogk-browser-assets.js';

vi.mock('#picogk-browser-assets.js', () => ({ loadPicogkBrowserAssets: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PicoGK browser registration', () => {
  it('should reject an unprepared host with a structured issue before starting a worker', async () => {
    const definition = await resolveRuntimePluginDefinition('kernel', picogkBrowserKernel());
    await expect(
      definition.initialize(picogkBrowserOptionsSchema.parse({}), createMockKernelRuntime()),
    ).rejects.toMatchObject({
      issues: [{ code: 'KERNEL_NOT_PREPARED', details: { producer: 'picogk', environment: 'browser' } }],
    });
  });

  it('should admit the host manifest relative to its location and defer worker startup', async () => {
    vi.stubGlobal('location', { href: 'https://tau.test/app/' });
    vi.stubGlobal('crossOriginIsolated', false);
    const worker = vi.fn();
    vi.stubGlobal('Worker', worker);
    vi.mocked(loadPicogkBrowserAssets).mockResolvedValue({
      mode: 'single',
      assets: {
        bootstrapUrl: 'https://tau.test/runtime.js',
        compilerIdentity: 'a'.repeat(64),
        runtimeFiles: [],
        references: [],
      },
    });
    const options = picogkBrowserOptionsSchema.parse({
      assets: { url: '/picogk/manifest.json', sha256: 'a'.repeat(64) },
    });
    const definition = await resolveRuntimePluginDefinition('kernel', picogkBrowserKernel(options));
    const services = createMockKernelRuntime();
    const context = await definition.initialize(options, services);
    expect(loadPicogkBrowserAssets).toHaveBeenCalledWith({
      manifest: { url: 'https://tau.test/picogk/manifest.json', sha256: 'a'.repeat(64) },
      wasm: 'auto',
      isolated: false,
      signal: services.signal,
    });
    expect(worker).not.toHaveBeenCalled();
    await definition.onDispose!(context);
  });

  it('should reject desktop launch options at the browser boundary', () => {
    expect(picogkBrowserOptionsSchema.safeParse({ closure: {} }).success).toBe(false);
    expect(picogkBrowserOptionsSchema.safeParse({ wasm: 'threads' }).success).toBe(false);
    expect(picogkBrowserOptionsSchema.safeParse({ recycleHeapBytes: 0 }).success).toBe(false);
    expect(picogkBrowserOptionsSchema.parse({}).recycleHeapBytes).toBe(1.5 * 2 ** 30);
  });
});
