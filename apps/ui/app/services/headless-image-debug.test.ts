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

  it('does not install or retain a bridge outside TAU_DEBUG', async () => {
    vi.doMock('#environment.config.js', () => ({ ENV: { TAU_DEBUG: false } }));
    const { recordHeadlessImageTiming } = await import('#services/headless-image-debug.js');
    recordHeadlessImageTiming('test', performance.now());
    expect(
      (globalThis as typeof globalThis & { __TAU_HEADLESS_IMAGE_DEBUG__?: DebugBridge }).__TAU_HEADLESS_IMAGE_DEBUG__,
    ).toBeUndefined();
  });
});
