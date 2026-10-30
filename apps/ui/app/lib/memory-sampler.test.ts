import { afterEach, describe, expect, it } from 'vitest';
import {
  readHighWaterWasmBytes,
  readLastMemorySample,
  resetMemorySampler,
  setKernelHeapReader,
  setLiveCountsReader,
  setRendererMemoryReader,
  takeMemorySample,
} from '#lib/memory-sampler.js';

/** Put Chromium’s non-standard `performance.memory` on this page, as that browser does. */
const withJsHeap = (memory: unknown): void => {
  Object.defineProperty(globalThis.performance, 'memory', { configurable: true, value: memory });
};

afterEach(() => {
  Reflect.deleteProperty(globalThis.performance, 'memory');
  resetMemorySampler();
});

describe('memory sampler (SB2, G4)', () => {
  it('reports nothing it cannot read, rather than reporting zeros', () => {
    const sample = takeMemorySample();

    expect(typeof sample.at).toBe('number');
    expect(sample).not.toHaveProperty('jsHeapUsedBytes');
    expect(sample).not.toHaveProperty('wasmHeapBytes');
    expect(sample).not.toHaveProperty('gpuGeometryBytes');
    expect(sample).not.toHaveProperty('liveProjects');
  });

  it('reads every registered source into one sample', () => {
    setKernelHeapReader(() => ({ bytesByKernelId: { 'kernel-a': 1000, 'kernel-b': 2500 }, source: 'kernel' }));
    setRendererMemoryReader(() => ({ geometryBytes: 400, textures: 7 }));
    setLiveCountsReader(() => ({ projects: 2, workers: 3 }));

    const sample = takeMemorySample();

    expect(sample.wasmHeapBytes).toEqual({ 'kernel-a': 1000, 'kernel-b': 2500 });
    expect(sample.heapSource).toBe('kernel');
    expect(sample.gpuGeometryBytes).toBe(400);
    expect(sample.textures).toBe(7);
    expect(sample.liveProjects).toBe(2);
    expect(sample.liveWorkers).toBe(3);
  });

  it('reads Chromium’s performance.memory when the browser offers it', () => {
    /* eslint-disable @typescript-eslint/naming-convention -- Chromium's own property names. */
    withJsHeap({ usedJSHeapSize: 12_000, jsHeapSizeLimit: 40_000 });
    /* eslint-enable @typescript-eslint/naming-convention -- restore test naming rules. */

    const sample = takeMemorySample();

    expect(sample.jsHeapUsedBytes).toBe(12_000);
    expect(sample.jsHeapLimitBytes).toBe(40_000);
  });

  it('ignores a figure that is not a finite, non-negative number', () => {
    setRendererMemoryReader(() => ({ geometryBytes: Number.NaN, textures: -1 }));

    const sample = takeMemorySample();

    expect(sample).not.toHaveProperty('gpuGeometryBytes');
    expect(sample).not.toHaveProperty('textures');
  });

  it('survives a reader that throws, because a sample is best effort', () => {
    setKernelHeapReader(() => {
      throw new Error('the kernel went away mid-sample');
    });
    setLiveCountsReader(() => ({ projects: 1 }));

    const sample = takeMemorySample();

    expect(sample).not.toHaveProperty('wasmHeapBytes');
    expect(sample.liveProjects).toBe(1);
  });

  it('keeps the high-water WASM total after the kernel that reached it has shrunk', () => {
    let bytes = 5000;
    setKernelHeapReader(() => ({ bytesByKernelId: { 'kernel-a': bytes }, source: 'recycle-hook' }));

    takeMemorySample();
    bytes = 9000;
    takeMemorySample();
    bytes = 1000;
    const sample = takeMemorySample();

    expect(sample.wasmHeapBytes).toEqual({ 'kernel-a': 1000 });
    expect(readHighWaterWasmBytes()).toBe(9000);
  });

  it('sums every live kernel into the high-water total, not just the largest', () => {
    setKernelHeapReader(() => ({ bytesByKernelId: { a: 3000, b: 4000 }, source: 'kernel' }));

    takeMemorySample();

    expect(readHighWaterWasmBytes()).toBe(7000);
  });

  it('keeps the latest sample for a report that must not take one of its own', () => {
    expect(readLastMemorySample()).toBeUndefined();
    setLiveCountsReader(() => ({ projects: 4 }));

    const taken = takeMemorySample();

    expect(readLastMemorySample()).toBe(taken);
  });

  it('never throws at its caller, because it samples on the path into heavy work', () => {
    const performanceNow = globalThis.performance.now.bind(globalThis.performance);
    globalThis.performance.now = () => {
      throw new Error('no clock on this page');
    };

    try {
      expect(takeMemorySample().at).toBe(0);
    } finally {
      globalThis.performance.now = performanceNow;
    }
  });

  it('forgets every reader and figure on reset, so one page cannot leak into the next', () => {
    setKernelHeapReader(() => ({ bytesByKernelId: { a: 8000 }, source: 'kernel' }));
    takeMemorySample();

    resetMemorySampler();

    expect(readLastMemorySample()).toBeUndefined();
    expect(readHighWaterWasmBytes()).toBeUndefined();
    expect(takeMemorySample()).not.toHaveProperty('wasmHeapBytes');
  });
});
