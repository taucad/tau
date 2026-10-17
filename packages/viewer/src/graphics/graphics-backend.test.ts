import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importBackend = async () => import('#graphics/graphics-backend.js');

describe('probeWebGpuSupport', () => {
  const requestAdapter = vi.fn<() => Promise<unknown>>();

  beforeEach(() => {
    vi.resetModules();
    requestAdapter.mockReset();
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter } });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'gpu');
  });

  it('should request an adapter once per page however many viewers probe', async () => {
    requestAdapter.mockResolvedValue({});
    const { probeWebGpuSupport } = await importBackend();

    const results = await Promise.all([probeWebGpuSupport(), probeWebGpuSupport(), probeWebGpuSupport()]);
    expect(await probeWebGpuSupport()).toBe(true);

    expect(results).toEqual([true, true, true]);
    expect(requestAdapter).toHaveBeenCalledTimes(1);
  });

  it('should remember that no adapter is available', async () => {
    requestAdapter.mockResolvedValue(null);
    const { probeWebGpuSupport } = await importBackend();

    expect(await probeWebGpuSupport()).toBe(false);
    expect(await probeWebGpuSupport()).toBe(false);

    expect(requestAdapter).toHaveBeenCalledTimes(1);
  });

  it('should probe again after a failed adapter request', async () => {
    requestAdapter.mockRejectedValueOnce(new Error('GPU process restarting')).mockResolvedValue({});
    const { probeWebGpuSupport } = await importBackend();

    expect(await probeWebGpuSupport()).toBe(false);
    expect(await probeWebGpuSupport()).toBe(true);

    expect(requestAdapter).toHaveBeenCalledTimes(2);
  });
});
