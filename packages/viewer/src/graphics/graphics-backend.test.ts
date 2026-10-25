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

describe('isSoftwareGpuAdapter', () => {
  it('should treat the fallback adapter and named CPU rasterizers as software', async () => {
    const { isSoftwareGpuAdapter } = await importBackend();

    expect(isSoftwareGpuAdapter({ isFallbackAdapter: true })).toBe(true);
    expect(isSoftwareGpuAdapter({ info: { isFallbackAdapter: true } })).toBe(true);
    expect(isSoftwareGpuAdapter({ info: { vendor: 'google', architecture: 'swiftshader' } })).toBe(true);
    expect(isSoftwareGpuAdapter({ info: { vendor: 'mesa', device: 'llvmpipe (LLVM 17.0.6, 256 bits)' } })).toBe(true);
  });

  it('should treat a hardware adapter, or one that reports nothing, as hardware', async () => {
    const { isSoftwareGpuAdapter } = await importBackend();

    expect(isSoftwareGpuAdapter({ isFallbackAdapter: false, info: { vendor: 'apple', architecture: 'metal-3' } })).toBe(
      false,
    );
    expect(isSoftwareGpuAdapter({ info: { vendor: 'nvidia', architecture: 'ampere', isFallbackAdapter: false } })).toBe(
      false,
    );
    expect(isSoftwareGpuAdapter({})).toBe(false);
  });
});
