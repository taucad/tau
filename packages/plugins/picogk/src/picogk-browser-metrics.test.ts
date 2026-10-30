import { describe, expect, it } from 'vitest';

import { withPicogkBrowserMemory } from '#picogk-browser-memory.js';
import { picogkWorkerMetricsSchema } from '#picogk.protocol.js';

describe('browser worker memory observations', () => {
  it('should distinguish unavailable process memory from measured zero', () => {
    const metrics = { managedHeapBytes: 32, picoGkNativeBytes: 64, processWorkingSetBytes: null };
    expect(picogkWorkerMetricsSchema.parse(metrics)).toEqual(metrics);
    expect(picogkWorkerMetricsSchema.parse({ ...metrics, processWorkingSetBytes: 0 }).processWorkingSetBytes).toBe(0);
    expect(picogkWorkerMetricsSchema.safeParse({ ...metrics, processWorkingSetBytes: -1 }).success).toBe(false);
  });
});

describe('browser idle heap recycling', () => {
  const build = {
    artifactPath: '/artifacts/mesh.bin',
    authoredOutputs: [],
    metrics: { managedHeapBytes: 32 },
    recycleAfterResponse: false,
  };
  it('should preserve original receipts and recycle only above the device threshold', () => {
    const below = withPicogkBrowserMemory(build, 511, 512);
    expect(below).toEqual({ ...build, metrics: { managedHeapBytes: 32, wasmHeapBytes: 511 } });
    expect(below['authoredOutputs']).toBe(build.authoredOutputs);
    expect(withPicogkBrowserMemory(build, 512, 512).recycleAfterResponse).toBe(false);
    expect(withPicogkBrowserMemory(build, 513, 512).recycleAfterResponse).toBe(true);
    expect(withPicogkBrowserMemory({ ...build, recycleAfterResponse: true }, 1, 512).recycleAfterResponse).toBe(true);
    expect(build.metrics).toEqual({ managedHeapBytes: 32 });
  });
  it.each([Number.NaN, -1, 0.5, Infinity])('should reject invalid heap observations %s', (heap) => {
    expect(() => withPicogkBrowserMemory(build, heap, 512)).toThrow();
  });
  it.each([Number.NaN, -1, 0, Infinity])('should reject invalid device thresholds %s', (threshold) => {
    expect(() => withPicogkBrowserMemory(build, 1, threshold)).toThrow();
  });
});
