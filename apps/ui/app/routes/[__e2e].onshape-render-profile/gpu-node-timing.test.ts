import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { REVISION, WebGLCoordinateSystem, WebGPUCoordinateSystem } from 'three';
import { expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { WebGPURenderer } from 'three/webgpu';
import { createNodeFrameGpuTimer } from '#routes/[__e2e].onshape-render-profile/gpu-node-timing.js';

type Pool = {
  queryOffsets: Map<string, number>;
  timestamps: Map<string, number>;
  resultBuffer?: GPUBuffer;
  // oxlint-disable-next-line typescript/no-restricted-types -- Match Three r184 query-pool state.
  pendingResolve: Promise<number> | null;
  resolveQueriesAsync: () => Promise<number>;
};

it('should sum all node passes once and stop collecting while readback is pending', async () => {
  const pending = Promise.withResolvers<number>();
  const pool = mock<Pool>({ pendingResolve: null });
  pool.queryOffsets = new Map();
  pool.timestamps = new Map();
  pool.resolveQueriesAsync.mockReturnValue(pending.promise);
  const backend = mock<
    WebGPURenderer['backend'] & {
      trackTimestamp: boolean;
      initTimestampQuery: (type: string, uid: string, descriptor: { timestampWrites?: unknown }) => void;
      timestampQueryPool: { render?: Pool };
    }
  >({ trackTimestamp: false });
  backend.timestampQueryPool = { render: pool };
  const renderer = mock<WebGPURenderer>({ coordinateSystem: WebGPUCoordinateSystem });
  renderer.backend = backend;
  renderer.hasFeature.mockReturnValue(true);
  const originalInit = backend.initTimestampQuery;
  originalInit.mockImplementation((_type, _uid, descriptor) => {
    descriptor.timestampWrites = {
      querySet: mock<GPUQuerySet>(),
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    };
  });
  const timer = createNodeFrameGpuTimer(renderer);
  expect(timer).toBeDefined();
  if (!timer) {
    throw new Error('Expected supported native timer');
  }
  expect(backend.trackTimestamp).toBe(false);
  expect(timer.begin()).toBe(true);
  expect(backend.trackTimestamp).toBe(true);
  const descriptor: { timestampWrites?: unknown } = {};
  backend.initTimestampQuery('render', 'beauty:f1', descriptor);
  expect(descriptor.timestampWrites).toBeDefined();
  pool.queryOffsets.set('beauty:f1', 0);
  pool.queryOffsets.set('output:f2', 2);
  timer.end();
  expect(descriptor.timestampWrites).toBeUndefined();
  expect(backend.trackTimestamp).toBe(false);
  expect(timer.begin()).toBe(false);
  expect(timer.poll()).toMatchObject({ milliseconds: [], pending: 1 });
  pool.timestamps.set('beauty:f1', 3);
  pool.timestamps.set('output:f2', 2);
  pending.resolve(2); // Three returns only its last render call, not the whole Tau frame.
  await vi.waitFor(() => {
    expect(timer.poll()).toMatchObject({ milliseconds: [5], pending: 0 });
  });
  expect(timer.poll()).toMatchObject({ milliseconds: [], pending: 0 });
  expect(pool.timestamps.size).toBe(0);
  const retired = Promise.withResolvers<number>();
  pool.resolveQueriesAsync.mockReturnValue(retired.promise);
  expect(timer.begin()).toBe(true);
  timer.end();
  timer.dispose();
  retired.resolve(2);
  await vi.waitFor(() => {
    expect(timer.poll()).toMatchObject({ milliseconds: [], pending: 0 });
  });
  expect(backend.trackTimestamp).toBe(false);
  expect(timer.begin()).toBe(false);
  expect(renderer.dispose).not.toHaveBeenCalled();
  expect(backend.initTimestampQuery).toBe(originalInit);
});

it('should leave unsupported or externally owned timestamp tracking untouched', () => {
  const backend = mock<WebGPURenderer['backend'] & { trackTimestamp: boolean }>({ trackTimestamp: true });
  const renderer = mock<WebGPURenderer>({ coordinateSystem: WebGPUCoordinateSystem });
  renderer.backend = backend;
  renderer.hasFeature.mockReturnValue(true);
  expect(createNodeFrameGpuTimer(renderer)).toBeUndefined();
  expect(backend.trackTimestamp).toBe(true);
  backend.trackTimestamp = false;
  renderer.hasFeature.mockReturnValue(false);
  expect(createNodeFrameGpuTimer(renderer)).toBeUndefined();
  expect(backend.trackTimestamp).toBe(false);
  const nodeWebGl = mock<WebGPURenderer>({ coordinateSystem: WebGLCoordinateSystem });
  nodeWebGl.hasFeature.mockReturnValue(true);
  const context = mock<WebGL2RenderingContext>();
  context.getExtension.mockReturnValue(null);
  context.createQuery.mockReturnValue(mock<WebGLQuery>());
  nodeWebGl.getContext.mockReturnValue(context);
  expect(createNodeFrameGpuTimer(nodeWebGl)).toBeUndefined();
  expect(context.getExtension).toHaveBeenCalledWith('EXT_disjoint_timer_query_webgl2');
});

it('should guard the timestamp pool implementation used for whole-frame timing', () => {
  const require = createRequire(import.meta.url);
  const root = resolve(dirname(require.resolve('three')), '..');
  expect(REVISION).toBe('184');
  expect(
    createHash('sha256')
      .update(readFileSync(resolve(root, 'src/renderers/webgpu/utils/WebGPUTimestampQueryPool.js')))
      .digest('hex'),
  ).toBe('2a0d4afb31849e72bb1e2821e707acf6e5f2ab16476dc2a32dbbc5f6beffd86d');
  expect(
    createHash('sha256')
      .update(readFileSync(resolve(root, 'src/renderers/webgpu/WebGPUBackend.js')))
      .digest('hex'),
  ).toBe('7e716cda174a0f155d3f53f2290dbdbf719c414f01923bb118eb31c433a8347e');
});

it.each(['missing', 'negative', 'nonfinite', 'rejected'] as const)(
  'should discard %s timestamp results without publishing stale durations',
  async (failure) => {
    const pool = mock<Pool>({ pendingResolve: null });
    pool.queryOffsets = new Map([['surface:f1', 0]]);
    pool.timestamps = new Map();
    const backend = mock<
      WebGPURenderer['backend'] & {
        trackTimestamp: boolean;
        timestampQueryPool: { render?: Pool };
      }
    >({ trackTimestamp: false });
    backend.timestampQueryPool = {};
    const renderer = mock<WebGPURenderer>({ coordinateSystem: WebGPUCoordinateSystem });
    renderer.backend = backend;
    renderer.hasFeature.mockReturnValue(true);
    const timer = createNodeFrameGpuTimer(renderer);
    if (!timer) {
      throw new Error('Expected supported native timer');
    }
    backend.timestampQueryPool.render = pool;
    if (failure === 'negative') {
      pool.timestamps.set('surface:f1', -1);
    } else if (failure === 'nonfinite') {
      pool.timestamps.set('surface:f1', Number.NaN);
    }
    if (failure === 'rejected') {
      pool.resolveQueriesAsync.mockRejectedValue(new Error('Device lost'));
    } else {
      pool.resolveQueriesAsync.mockResolvedValue(99);
    }
    expect(timer.begin()).toBe(true);
    timer.end();
    await vi.waitFor(() => {
      expect(timer.poll()).toMatchObject({ milliseconds: [], pending: 0, failedSamples: 1 });
    });
    expect(backend.trackTimestamp).toBe(false);
    timer.dispose();
  },
);

it.each([false, true, 'all'] as const)(
  'should retain overlapping pass ranges with unwritten clear query pair %s',
  async (unwritten) => {
    const pool = mock<Pool>({ pendingResolve: null });
    pool.queryOffsets = new Map();
    pool.timestamps = new Map();
    pool.resultBuffer = mock<GPUBuffer>();
    // Two overlapping passes: 3 + 2 ms of intervals, but only 4 ms from first to last.
    const raw = new BigUint64Array(
      unwritten === 'all' ? [0n, 0n, 0n, 0n, 0n, 0n] : [1_000_000n, 4_000_000n, 3_000_000n, 5_000_000n, 0n, 0n],
    );
    const mapped = vi.mocked(pool.resultBuffer.getMappedRange);
    mapped.mockReturnValue(raw.buffer);
    pool.resolveQueriesAsync.mockImplementation(async () => {
      pool.resultBuffer?.getMappedRange(0, raw.byteLength);
      pool.timestamps.set('beauty:f1', unwritten === 'all' ? 0 : 3);
      pool.timestamps.set('output:f2', unwritten === 'all' ? 0 : 2);
      if (unwritten) {
        pool.timestamps.set('clear:f3', 0);
      }
      return 2;
    });
    const backend = mock<
      WebGPURenderer['backend'] & {
        trackTimestamp: boolean;
        timestampQueryPool: { render?: Pool };
      }
    >({ trackTimestamp: false });
    backend.timestampQueryPool = { render: pool };
    const renderer = mock<WebGPURenderer>({ coordinateSystem: WebGPUCoordinateSystem });
    renderer.backend = backend;
    renderer.hasFeature.mockReturnValue(true);
    const timer = createNodeFrameGpuTimer(renderer)!;
    timer.begin();
    pool.queryOffsets.set('beauty:f1', 0);
    pool.queryOffsets.set('output:f2', 2);
    if (unwritten) {
      pool.queryOffsets.set('clear:f3', 4);
    }
    timer.end();
    await vi.waitFor(() => {
      expect(timer.poll()).toMatchObject(
        unwritten === 'all'
          ? { milliseconds: [], passRanges: [], failedSamples: 1 }
          : {
              milliseconds: [5],
              passRanges: [
                [
                  { uid: 'beauty:f1', start: 0, end: 3 },
                  { uid: 'output:f2', start: 2, end: 4 },
                ],
              ],
            },
      );
    });
    expect(pool.resultBuffer.getMappedRange).toBe(mapped);
    expect(timer.poll()).toMatchObject({ passRanges: [] });
    timer.dispose();
  },
);

it('should wait for a retired timer readback before borrowing the same pool', () => {
  const pool = mock<Pool>({ pendingResolve: null });
  pool.queryOffsets = new Map();
  pool.pendingResolve = Promise.resolve(0);
  const backend = mock<
    WebGPURenderer['backend'] & {
      trackTimestamp: boolean;
      timestampQueryPool: { render?: Pool };
    }
  >({ trackTimestamp: false });
  backend.timestampQueryPool = { render: pool };
  const renderer = mock<WebGPURenderer>({ coordinateSystem: WebGPUCoordinateSystem });
  renderer.backend = backend;
  renderer.hasFeature.mockReturnValue(true);
  const timer = createNodeFrameGpuTimer(renderer)!;
  expect(timer.begin()).toBe(false);
  expect(backend.trackTimestamp).toBe(false);
  pool.pendingResolve = null;
  expect(timer.begin()).toBe(true);
  timer.dispose();
});
