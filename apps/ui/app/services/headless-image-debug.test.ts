import { afterEach, describe, expect, it, vi } from 'vitest';

type DebugBridge = { readonly records: unknown[]; reset(): void };

const clearBridge = (): void => {
  delete (globalThis as typeof globalThis & { __TAU_HEADLESS_IMAGE_DEBUG__?: DebugBridge })
    .__TAU_HEADLESS_IMAGE_DEBUG__;
};

describe('headless image debug timing', () => {
  afterEach(() => {
    clearBridge();
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.doUnmock('#environment.config.js');
  });

  it('bounds and resets records in TAU_DEBUG', async () => {
    vi.doMock('#environment.config.js', () => ({ ENV: { TAU_DEBUG: true } }));
    const { recordHeadlessImageTiming } = await import('#services/headless-image-debug.js');
    for (let index = 0; index < 600; index++) {
      recordHeadlessImageTiming('test', performance.now(), { index });
    }
    const bridge = (globalThis as typeof globalThis & { __TAU_HEADLESS_IMAGE_DEBUG__?: DebugBridge })
      .__TAU_HEADLESS_IMAGE_DEBUG__;
    expect(bridge?.records).toHaveLength(512);
    bridge?.reset();
    expect(bridge?.records).toEqual([]);
  });

  it('stays inert off-page, where the environment facade cannot be read', async () => {
    // The real facade treats "no `window`" as "node" and dereferences
    // `process.env`, so reading it from a worker throws. The capture path runs
    // in the agent-host worker, and a timing record must never fail a capture.
    vi.doMock('#environment.config.js', () => ({
      ENV: {
        get TAU_DEBUG(): boolean {
          throw new TypeError("Cannot read properties of undefined (reading 'env')");
        },
      },
    }));
    vi.stubGlobal('window', undefined);
    const { recordHeadlessImageTiming } = await import('#services/headless-image-debug.js');
    expect(() => {
      recordHeadlessImageTiming('test', performance.now());
    }).not.toThrow();
    expect(
      (globalThis as typeof globalThis & { __TAU_HEADLESS_IMAGE_DEBUG__?: DebugBridge }).__TAU_HEADLESS_IMAGE_DEBUG__,
    ).toBeUndefined();
  });

  it('does not install or retain a bridge outside TAU_DEBUG', async () => {
    vi.doMock('#environment.config.js', () => ({ ENV: { TAU_DEBUG: false } }));
    const { recordHeadlessImageTiming } = await import('#services/headless-image-debug.js');
    recordHeadlessImageTiming('test', performance.now());
    expect(
      (globalThis as typeof globalThis & { __TAU_HEADLESS_IMAGE_DEBUG__?: DebugBridge }).__TAU_HEADLESS_IMAGE_DEBUG__,
    ).toBeUndefined();
  });
});
