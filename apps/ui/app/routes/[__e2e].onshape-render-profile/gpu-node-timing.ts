import { REVISION, WebGLCoordinateSystem } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { createFrameGpuTimer } from '#routes/[__e2e].onshape-render-profile/gpu-timing.js';
import type { FrameGpuTimer, GpuPassRange } from '#routes/[__e2e].onshape-render-profile/gpu-timing.js';

type TimedPassDescriptor = { timestampWrites?: unknown };

type TimestampPool = {
  readonly queryOffsets: Map<string, number>;
  readonly timestamps: Map<string, number>;
  readonly resultBuffer?: GPUBuffer;
  // oxlint-disable-next-line typescript/no-restricted-types -- Three r184 uses null for an idle query pool.
  readonly pendingResolve: Promise<number> | null;
  resolveQueriesAsync: () => Promise<number>;
};

type TimestampBackend = WebGPURenderer['backend'] & {
  trackTimestamp: boolean;
  initTimestampQuery: (type: string, uid: string, descriptor: TimedPassDescriptor) => void;
  readonly timestampQueryPool: { readonly render?: TimestampPool };
};

/** Diagnose all render passes in a Tau frame; never enable queries in ordinary rendering. */
export function createNodeFrameGpuTimer(renderer: WebGPURenderer): FrameGpuTimer | undefined {
  if (renderer.coordinateSystem === WebGLCoordinateSystem) {
    // Three r184 declares the common renderer context as unknown; its initialized
    // WebGL coordinate system identifies the WebGL2 backend's actual context.
    const context = renderer.getContext() as WebGL2RenderingContext;
    return createFrameGpuTimer({ getContext: () => context });
  }
  if (REVISION !== '184' || !renderer.hasFeature('timestamp-query')) {
    return undefined;
  }
  // Three r184 declarations omit this backend surface. The source fingerprint and async
  // lifecycle tests guard the adapter; the renderer remains the query-pool owner.
  const backend = renderer.backend as TimestampBackend;
  if (backend.trackTimestamp || (backend.timestampQueryPool.render?.queryOffsets.size ?? 0) > 0) {
    return undefined;
  }
  const completed: number[] = [];
  const passRanges: GpuPassRange[][] = [];
  let active = false;
  let disposed = false;
  let pending: Promise<void> | undefined;
  let failedSamples = 0;
  const descriptors = new Set<TimedPassDescriptor>();
  const originalInitTimestampQuery = backend.initTimestampQuery;
  const initTimestampQuery: TimestampBackend['initTimestampQuery'] = (type, uid, descriptor) => {
    originalInitTimestampQuery.call(backend, type, uid, descriptor);
    if (active && descriptor.timestampWrites) {
      descriptors.add(descriptor);
    }
  };
  backend.initTimestampQuery = initTimestampQuery;

  const stopTracking = (): void => {
    backend.trackTimestamp = false;
    // Three caches its canvas descriptor. Merely disabling trackTimestamp leaves
    // old writes attached to later unsampled passes (including explicit clears).
    for (const descriptor of descriptors) {
      delete descriptor.timestampWrites;
    }
    descriptors.clear();
    active = false;
  };

  const collect = async (pool: TimestampPool, offsets: Map<string, number>): Promise<void> => {
    const keys = [...offsets.keys()];
    const buffer = pool.resultBuffer;
    const originalGetMappedRange = buffer?.getMappedRange;
    let raw: BigUint64Array | undefined;
    const getMappedRange: GPUBuffer['getMappedRange'] = (offset, size) => {
      const mapped = originalGetMappedRange!.call(buffer, offset, size);
      // Copy before Three unmaps its owned buffer. Diagnostic-only, one pending frame.
      raw = new BigUint64Array(mapped).slice();
      return mapped;
    };
    try {
      if (buffer) {
        buffer.getMappedRange = getMappedRange;
      }
      // Its returned number covers only the last Three render call. The pool's
      // resolved per-pass map covers all nested calls made during this Tau frame.
      await pool.resolveQueriesAsync();
      if (disposed) {
        return;
      }
      const values = keys.map((key) => pool.timestamps.get(key));
      if (values.length === 0 || values.some((value) => value === undefined || !Number.isFinite(value) || value < 0)) {
        failedSamples++;
        return;
      }
      if (
        raw &&
        [...offsets.values()].every((offset) => raw![offset] !== undefined && raw![offset + 1] !== undefined)
      ) {
        // Three can reserve a pair for a clear whose descriptor is subsequently reused.
        // An unwritten pair resolves to (0, 0), not a timestamp at device epoch zero.
        const written = [...offsets].filter(([, offset]) => raw![offset] !== 0n || raw![offset + 1] !== 0n);
        if (written.length === 0) {
          failedSamples++;
          return;
        }
        let origin = raw[written[0]![1]]!;
        for (const [, offset] of written) {
          if (raw[offset]! < origin) {
            origin = raw[offset]!;
          }
        }
        passRanges.push(
          written.map(([uid, offset]) => ({
            uid,
            start: Number(raw![offset]! - origin) / 1_000_000,
            end: Number(raw![offset + 1]! - origin) / 1_000_000,
          })),
        );
      }
      completed.push(values.reduce<number>((sum, value) => sum + (value ?? 0), 0));
    } catch {
      if (!disposed) {
        failedSamples++;
      }
    } finally {
      if (buffer?.getMappedRange === getMappedRange) {
        buffer.getMappedRange = originalGetMappedRange!;
      }
      for (const key of keys) {
        pool.timestamps.delete(key);
      }
      pending = undefined;
    }
  };

  return {
    support: { extension: 'WebGPU timestamp-query (sum of render passes)', counterBits: 64 },
    begin() {
      if (
        disposed ||
        active ||
        pending !== undefined ||
        backend.trackTimestamp ||
        backend.timestampQueryPool.render?.pendingResolve
      ) {
        return false;
      }
      active = true;
      backend.trackTimestamp = true;
      return true;
    },
    end() {
      if (!active) {
        return;
      }
      stopTracking();
      const pool = backend.timestampQueryPool.render;
      if (!pool || pool.queryOffsets.size === 0) {
        failedSamples++;
        return;
      }
      pending = collect(pool, new Map(pool.queryOffsets));
    },
    poll() {
      return {
        milliseconds: completed.splice(0),
        passRanges: passRanges.splice(0),
        pending: Number(Boolean(pending)),
        disjointDiscarded: 0,
        failedSamples,
      };
    },
    dispose() {
      if (active) {
        stopTracking();
      }
      if (backend.initTimestampQuery === initTimestampQuery) {
        backend.initTimestampQuery = originalInitTimestampQuery;
      }
      disposed = true;
      completed.length = 0;
      passRanges.length = 0;
      // In-flight readback can finish, but cannot publish into a retired timer.
      // Do not dispose the borrowed pool: the renderer owns it until teardown.
    },
  };
}
