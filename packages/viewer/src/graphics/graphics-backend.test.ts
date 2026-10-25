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

  it('should keep a canvas loss reported while a failing adapter request was in flight', async () => {
    const request = Promise.withResolvers<unknown>();
    requestAdapter.mockReturnValueOnce(request.promise).mockResolvedValue({});
    const { probeWebGpuSupport, reportWebGpuCanvasLoss, webGpuFallbackReason } = await importBackend();

    const inFlight = probeWebGpuSupport();
    reportWebGpuCanvasLoss();
    request.reject(new Error('GPU process restarting'));

    expect(await inFlight).toBe(false);
    expect(await probeWebGpuSupport()).toBe(false);
    expect(requestAdapter).toHaveBeenCalledTimes(1);
    expect(webGpuFallbackReason()).toBe('canvas-loss');
  });

  it('should tell loss listeners and report no fallback reason before a loss', async () => {
    const { onWebGpuCanvasLoss, reportWebGpuCanvasLoss, webGpuFallbackReason } = await importBackend();
    const listener = vi.fn();
    const stop = onWebGpuCanvasLoss(listener);
    expect(webGpuFallbackReason()).toBeUndefined();

    reportWebGpuCanvasLoss();
    stop();
    reportWebGpuCanvasLoss();

    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('probeWebGpuSupportWithin', () => {
  const requestAdapter = vi.fn<() => Promise<unknown>>();

  beforeEach(() => {
    vi.resetModules();
    requestAdapter.mockReset();
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter } });
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'gpu');
  });

  it('should answer with the adapter probe when it settles in time', async () => {
    requestAdapter.mockResolvedValue({});
    const { probeWebGpuSupportWithin } = await importBackend();

    expect(await probeWebGpuSupportWithin(1000)).toBe(true);
  });

  it('should answer false once an adapter request that never settles runs out of time', async () => {
    vi.useFakeTimers();
    requestAdapter.mockReturnValue(
      new Promise<never>(() => {
        // Never settles, like a stalled adapter request.
      }),
    );
    const { probeWebGpuSupportWithin, webGpuProbeTimeout } = await importBackend();

    const answer = probeWebGpuSupportWithin();
    await vi.advanceTimersByTimeAsync(webGpuProbeTimeout);

    expect(await answer).toBe(false);
  });

  it('should answer false at once without WebGPU (SSR, unsupported browsers)', async () => {
    Reflect.deleteProperty(navigator, 'gpu');
    const { probeWebGpuSupportWithin } = await importBackend();

    expect(await probeWebGpuSupportWithin(1000)).toBe(false);
    expect(requestAdapter).not.toHaveBeenCalled();
  });
});

describe('isSoftwareGpuAdapter', () => {
  it('should treat the fallback adapter and named CPU rasterizers as software', async () => {
    const { isSoftwareGpuAdapter } = await importBackend();

    expect(isSoftwareGpuAdapter({ isFallbackAdapter: true })).toBe(true);
    expect(isSoftwareGpuAdapter({ info: { isFallbackAdapter: true } })).toBe(true);
    expect(isSoftwareGpuAdapter({ info: { vendor: 'google', architecture: 'swiftshader' } })).toBe(true);
    expect(isSoftwareGpuAdapter({ info: { vendor: 'mesa', device: 'llvmpipe (LLVM 17.0.6, 256 bits)' } })).toBe(true);
    expect(isSoftwareGpuAdapter({ info: { vendor: 'mesa', device: 'lavapipe' } })).toBe(true);
  });

  it('should treat Windows WARP, the Microsoft Basic Render Driver, as software', async () => {
    const { isSoftwareGpuAdapter } = await importBackend();

    expect(isSoftwareGpuAdapter({ info: { vendor: 'microsoft', description: 'Microsoft Basic Render Driver' } })).toBe(
      true,
    );
    expect(isSoftwareGpuAdapter({ info: { vendor: 'microsoft', architecture: 'WARP' } })).toBe(true);
    // Whole words only: a hardware name that merely contains "warp" is not WARP.
    expect(
      isSoftwareGpuAdapter({ info: { vendor: 'acme', device: 'warpdrive x1', description: 'render driver' } }),
    ).toBe(false);
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
    // Whole words only: a hardware name that merely contains "cpu" or "software" is not a software rasterizer.
    expect(isSoftwareGpuAdapter({ info: { vendor: 'acme', description: 'gpucpu-bridge softwareless' } })).toBe(false);
  });
});
