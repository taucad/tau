import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  recordGeometryReceived,
  recordInteraction,
  recordOperationBegin,
  recordOperationSettled,
  recordViewerWork,
} from '#lib/kill-work-context.js';
import { recordKillWork, recordMemoryBreadcrumb } from '#lib/memory-kill-signal.js';

let work: Record<string, unknown> = {};

vi.mock('#lib/memory-kill-signal.js', () => ({
  recordKillWork: vi.fn((patch: Record<string, unknown>) => {
    work = { ...work, ...patch };
  }),
  readKillWork: vi.fn(() => work),
  recordMemoryBreadcrumb: vi.fn(),
}));

vi.mock('@taucad/viewer/lib/renderer-telemetry', () => ({
  readRendererMemory: () => ({ geometries: 12, textures: 3 }),
}));

afterEach(() => {
  work = {};
  vi.mocked(recordKillWork).mockClear();
  vi.mocked(recordMemoryBreadcrumb).mockClear();
});

type Settled = Parameters<typeof recordOperationSettled>[0];
const settled = (over: Partial<Settled> = {}): Settled => ({
  operation: 'render',
  kernel: 'replicad',
  outcome: { type: 'succeeded' },
  duration: 900,
  worker: undefined,
  ...over,
});

describe('kill work context (crash capture blueprint)', () => {
  it('records the phases of one render before each step, with the trail names', () => {
    recordOperationBegin({ operation: 'initialize' });
    expect(work['phase']).toBe('kernel-init');
    recordOperationBegin({ operation: 'evaluate' });
    expect(work['phase']).toBe('evaluate');
    recordOperationBegin({ operation: 'render' });
    expect(work).toMatchObject({ phase: 'mesh', renderCount: 1 });
    recordOperationSettled(
      settled({ worker: { queue: 0, execution: 800, cold: false, reuse: 'computed', triangles: 5000, heapBytes: 9 } }),
    );
    expect(work).toMatchObject({ phase: 'mesh', kernel: 'replicad', lastRender: 800, triangles: 5000 });
    expect(work['peakWasmBytes']).toBe(9);
    recordGeometryReceived(4096);
    expect(work).toMatchObject({ phase: 'geometry-receive', geometryBytes: 4096 });
    recordViewerWork({ event: 'upload-start', backend: 'webgl' });
    expect(work['phase']).toBe('gpu-upload');
    recordViewerWork({ event: 'first-frame', backend: 'webgl', triangles: 5000 });
    expect(work).toMatchObject({ phase: 'idle', gpuGeometries: 12, textures: 3 });

    expect(vi.mocked(recordMemoryBreadcrumb).mock.calls.map(([name]) => name)).toEqual([
      'kernel.init',
      'evaluate',
      'render',
      'geometry.receive',
      'first-frame',
    ]);
  });

  it('returns to idle after a failed attempt', () => {
    recordOperationBegin({ operation: 'evaluate' });
    recordOperationSettled(settled({ operation: 'evaluate', outcome: { type: 'cancelled' } }));

    expect(work).toMatchObject({ phase: 'idle', lastEvaluate: 900 });
  });

  it('counts parameter changes and records an interaction at most once per 10 s', () => {
    recordInteraction('parameter');
    recordInteraction('parameter');

    expect(work).toMatchObject({ lastInteraction: 'parameter', parameterChanges: 1 });
  });
});
