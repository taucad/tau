/**
 * The memory sampler (browser observability SB2, G4): one snapshot of what this page is holding,
 * for SB1's `tau.memory` context and SB3's kill marker.
 *
 * Sampling is event-driven, not timer-driven. A sample is taken as heavy work starts, because a
 * kill happens during heavy work and the sample taken as it begins is the one worth having. Every
 * reader is a **cached** value its owner has already observed: the sampler never messages a worker
 * and never awaits, so a sample costs microseconds and can run on the path to a breadcrumb.
 *
 * iOS exposes no JavaScript memory API, so the WASM and GPU numbers Tau tracks itself are the only
 * useful signal there; `performance.memory` is Chromium's and is simply absent elsewhere.
 * `performance.measureUserAgentSpecificMemory()` is deliberately not read: it is coupled to garbage
 * collection and can take seconds, which the sampling path cannot afford.
 */

/** Where a WASM heap figure came from: the kernel's own report, or the recycling hook's cache. */
export type HeapSource = 'kernel' | 'recycle-hook';

/** One snapshot. Every field is absent when this browser or this page cannot supply it. @public */
export type MemorySample = Readonly<{
  /** `performance.now()` when the sample was taken. */
  at: number;
  jsHeapUsedBytes?: number;
  jsHeapLimitBytes?: number;
  /** WASM heap per live kernel, keyed by runtime kernel id. */
  wasmHeapBytes?: Readonly<Record<string, number>>;
  heapSource?: HeapSource;
  gpuGeometryBytes?: number;
  textures?: number;
  liveProjects?: number;
  liveWorkers?: number;
}>;

/** The kernel heaps their owner last observed, never a fresh round trip to a worker. @public */
export type KernelHeapReader = () => Readonly<{
  bytesByKernelId: Readonly<Record<string, number>>;
  source: HeapSource;
}>;

/** The viewer's `renderer.info.memory`, as the viewer last read it. @public */
export type RendererMemoryReader = () => Readonly<{ geometryBytes?: number; textures?: number }>;

/** How many projects and workers are live, from the sessions registry and the runtime clients. @public */
export type LiveCountsReader = () => Readonly<{ projects?: number; workers?: number }>;

let readKernelHeaps: KernelHeapReader | undefined;
let readRendererMemory: RendererMemoryReader | undefined;
let readLiveCounts: LiveCountsReader | undefined;
let lastSample: MemorySample | undefined;
let highWaterWasmBytes: number | undefined;

/** Drop the `undefined` entries, so an unavailable figure stays absent rather than becoming null. */
const defined = <Value>(record: Readonly<Record<string, Value | undefined>>): Record<string, Value> =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as Record<string, Value>;

/** A finite, non-negative number, or nothing: a reader may hand back `NaN` from a missing counter. */
const gauge = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

/**
 * Chromium's non-standard `performance.memory`. Absent in Safari and Firefox, and absent in
 * Chromium itself on a page that is not isolated, so every read is guarded.
 *
 * @returns The used and limit figures this browser offers.
 */
const readJsHeap = (): Readonly<{ used: number | undefined; limit: number | undefined }> => {
  try {
    const memory: unknown = Reflect.get(globalThis.performance, 'memory');
    if (typeof memory !== 'object' || memory === null) {
      return { used: undefined, limit: undefined };
    }
    return { used: gauge(Reflect.get(memory, 'usedJSHeapSize')), limit: gauge(Reflect.get(memory, 'jsHeapSizeLimit')) };
  } catch {
    return { used: undefined, limit: undefined };
  }
};

/**
 * The page clock, or 0 where there is none. `recordMemoryBreadcrumb` samples on the path into heavy
 * work, so nothing here may throw at its caller: a missing sample is a lost diagnostic, a thrown one
 * is a broken feature.
 *
 * @returns Milliseconds since the page started, or 0.
 */
const readNow = (): number => {
  try {
    return globalThis.performance.now();
  } catch {
    return 0;
  }
};

/** Call a reader without letting its failure reach the caller: a sample is best effort. */
const attempt = <Value>(read: (() => Value) | undefined): Value | undefined => {
  if (read === undefined) {
    return undefined;
  }
  try {
    return read();
  } catch {
    return undefined;
  }
};

/**
 * Register the kernel heap reader, or remove it with `undefined` when the last kernel goes.
 *
 * @param reader - Reads the heaps its owner has already observed.
 * @public
 */
export const setKernelHeapReader = (reader: KernelHeapReader | undefined): void => {
  readKernelHeaps = reader;
};

/**
 * Register the viewer's memory reader, or remove it with `undefined` when the viewer unmounts.
 *
 * @param reader - Reads `renderer.info.memory` as the viewer last saw it.
 * @public
 */
export const setRendererMemoryReader = (reader: RendererMemoryReader | undefined): void => {
  readRendererMemory = reader;
};

/**
 * Register the live-count reader, or remove it with `undefined`.
 *
 * @param reader - Reads the live project and worker counts.
 * @public
 */
export const setLiveCountsReader = (reader: LiveCountsReader | undefined): void => {
  readLiveCounts = reader;
};

/**
 * Take one sample and keep it as the page's latest, raising the high-water WASM total if this
 * sample beats it.
 *
 * @returns The sample just taken.
 * @public
 */
export const takeMemorySample = (): MemorySample => {
  const heap = readJsHeap();
  const kernels = attempt(readKernelHeaps);
  const renderer = attempt(readRendererMemory);
  const counts = attempt(readLiveCounts);
  const wasmHeapBytes = kernels === undefined ? undefined : defined(kernels.bytesByKernelId);
  const wasmTotal =
    wasmHeapBytes === undefined
      ? undefined
      : Object.values(wasmHeapBytes).reduce<number>((total, bytes) => total + (gauge(bytes) ?? 0), 0);
  if (wasmTotal !== undefined && (highWaterWasmBytes === undefined || wasmTotal > highWaterWasmBytes)) {
    highWaterWasmBytes = wasmTotal;
  }
  const sample: MemorySample = {
    at: readNow(),
    ...defined({
      jsHeapUsedBytes: heap.used,
      jsHeapLimitBytes: heap.limit,
      wasmHeapBytes: wasmHeapBytes === undefined || Object.keys(wasmHeapBytes).length === 0 ? undefined : wasmHeapBytes,
      heapSource: kernels?.source,
      gpuGeometryBytes: gauge(renderer?.geometryBytes),
      textures: gauge(renderer?.textures),
      liveProjects: gauge(counts?.projects),
      liveWorkers: gauge(counts?.workers),
    }),
  };
  lastSample = sample;
  return sample;
};

/**
 * The most recent sample, for a report that must not take one of its own.
 *
 * @returns The last sample, or `undefined` before the first.
 * @public
 */
export const readLastMemorySample = (): MemorySample | undefined => lastSample;

/**
 * The highest WASM total seen on this page, which outlives the kernel that reached it.
 *
 * @returns The high-water total in bytes, or `undefined` while no kernel has reported.
 * @public
 */
export const readHighWaterWasmBytes = (): number | undefined => highWaterWasmBytes;

/**
 * Forget every reader and every figure. For tests, and for a page that is tearing down.
 *
 * @public
 */
export const resetMemorySampler = (): void => {
  readKernelHeaps = undefined;
  readRendererMemory = undefined;
  readLiveCounts = undefined;
  lastSample = undefined;
  highWaterWasmBytes = undefined;
};
