// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime/client';
import { createMockRuntimeClient, createMockRuntimeDocument } from '@taucad/runtime-testing';
import { runBenchmarks } from '#benchmarks/benchmark-runner.js';
import { CpuProfiler } from '#benchmarks/cpu-profiler.js';
import type { HostRenderBoundary } from '#benchmarks/benchmark-runner.js';

vi.mock('@taucad/runtime/client', async (importOriginal) => ({
  ...(await importOriginal()),
  createRuntimeClient: vi.fn(),
}));

const cases = [
  {
    name: 'cleanup-owner-control',
    category: 'cleanup',
    files: { 'main.ts': 'export default function main() { return undefined; }' },
    mainFile: 'main.ts',
    mode: 'first-call',
    operation: 'render',
  },
] satisfies Parameters<typeof runBenchmarks>[0];
const options = { iterations: 1, operation: 'render' } satisfies Parameters<typeof runBenchmarks>[1];

beforeEach(() => {
  vi.clearAllMocks();
});

it('should terminate its actual mock client when the render reports a geometry failure', async () => {
  const client = createMockRuntimeClient();
  const fixture = createMockRuntimeDocument();
  const boundaries: string[] = [];
  vi.mocked(client.open).mockReturnValue(fixture.document);
  vi.mocked(createRuntimeClient).mockReturnValue(client);
  vi.mocked(fixture.view.rendering).mockResolvedValue({
    superseded: false,
    rendering: {
      requestId: 'failed',
      evaluationId: fixture.evaluation.id,
      transient: false,
      success: false,
      issues: [{ severity: 'error', code: 'RUNTIME', message: 'selected render failed' }],
    },
  });
  await expect(
    runBenchmarks(cases, {
      ...options,
      onIterationStart: ({ iteration }) => {
        boundaries.push(`start:${iteration}`);
        expect(fixture.view.rendering).not.toHaveBeenCalled();
      },
      onIterationProgress: ({ iteration, elapsed }) => {
        boundaries.push(`end:${iteration}`);
        expect(elapsed).toBeGreaterThanOrEqual(0);
        expect(fixture.view.rendering).toHaveBeenCalledOnce();
      },
    }),
  ).rejects.toThrow('selected render failed');
  expect(boundaries).toEqual(['start:1', 'end:1']);
  expect(client.terminate).toHaveBeenCalledOnce();
});

it('should preserve the exact primary rejection when termination also fails', async () => {
  const client = createMockRuntimeClient();
  const fixture = createMockRuntimeDocument();
  vi.mocked(client.open).mockReturnValue(fixture.document);
  vi.mocked(createRuntimeClient).mockReturnValue(client);
  const primary = new Error('render callback rejected');
  vi.mocked(fixture.view.rendering).mockRejectedValue(primary);
  vi.mocked(client.terminate).mockImplementation(() => {
    throw new Error('cleanup rejected');
  });
  await expect(runBenchmarks(cases, options)).rejects.toBe(primary);
  expect(client.terminate).toHaveBeenCalledOnce();
});

it('should preserve rejection with undefined rather than treating it as successful cleanup', async () => {
  const client = createMockRuntimeClient();
  const fixture = createMockRuntimeDocument();
  vi.mocked(client.open).mockReturnValue(fixture.document);
  vi.mocked(createRuntimeClient).mockReturnValue(client);
  vi.mocked(fixture.view.rendering).mockRejectedValue(undefined);
  vi.mocked(client.terminate).mockImplementation(() => {
    throw new Error('cleanup rejected');
  });
  await expect(runBenchmarks(cases, options)).rejects.toBeUndefined();
  expect(client.terminate).toHaveBeenCalledOnce();
});

it('should surface cleanup failure after the render operation succeeded', async () => {
  const client = createMockRuntimeClient();
  const fixture = createMockRuntimeDocument();
  vi.mocked(client.open).mockReturnValue(fixture.document);
  vi.mocked(createRuntimeClient).mockReturnValue(client);
  // These bytes pass the media gate but never reach GLB parsing because cleanup fails first.
  vi.mocked(fixture.view.rendering).mockResolvedValue({
    superseded: false,
    rendering: {
      success: true,
      requestId: 'success',
      evaluationId: fixture.evaluation.id,
      transient: false,
      view: 'model',
      issues: [],
      artifact: { mimeType: 'model/gltf-binary', content: Uint8Array.of(1) },
      hash: 'cleanup-result',
    },
  });
  const cleanup = new Error('owned termination failed');
  vi.mocked(client.terminate).mockImplementation(() => {
    throw cleanup;
  });
  await expect(runBenchmarks(cases, options)).rejects.toBe(cleanup);
  expect(client.terminate).toHaveBeenCalledOnce();
});

it('should dispatch the configured render operation without a per-case override and still terminate its client', async () => {
  const client = createMockRuntimeClient();
  const fixture = createMockRuntimeDocument();
  vi.mocked(client.open).mockReturnValue(fixture.document);
  vi.mocked(createRuntimeClient).mockReturnValue(client);
  // As in the cleanup-success control, these bytes never reach GLB parsing: termination fails first.
  vi.mocked(fixture.view.rendering).mockResolvedValue({
    superseded: false,
    rendering: {
      success: true,
      requestId: 'success',
      evaluationId: fixture.evaluation.id,
      transient: false,
      view: 'model',
      issues: [],
      artifact: { mimeType: 'model/gltf-binary', content: Uint8Array.of(1) },
      hash: 'cleanup-result',
    },
  });
  const cleanup = new Error('configured operation completed before cleanup');
  vi.mocked(client.terminate).mockImplementation(() => {
    throw cleanup;
  });
  const benchmarkCase = cases[0];
  if (!benchmarkCase) {
    throw new Error('Expected the existing cleanup control case.');
  }
  const { name, category, files, mainFile, mode } = benchmarkCase;
  await expect(runBenchmarks([{ name, category, files, mainFile, mode }], options)).rejects.toBe(cleanup);
  expect(fixture.view.rendering).toHaveBeenCalledOnce();
  expect(client.open).toHaveBeenCalledWith({ source: { path: mainFile }, parameters: {} });
  expect(fixture.viewSpy).toHaveBeenCalledWith('model', { content: { includeEdges: false } });
  expect(fixture.document.export).not.toHaveBeenCalled();
  expect(client.terminate).toHaveBeenCalledOnce();
});

it('should retain host await boundaries through deferred cancellation and close both owners', async () => {
  const client = createMockRuntimeClient();
  const fixture = createMockRuntimeDocument();
  vi.mocked(client.open).mockReturnValue(fixture.document);
  vi.mocked(createRuntimeClient).mockReturnValue(client);
  const rendering = Promise.withResolvers<Awaited<ReturnType<typeof fixture.view.rendering>>>();
  vi.mocked(fixture.view.rendering).mockReturnValue(rendering.promise);
  const boundaries: HostRenderBoundary[] = [];
  const result = runBenchmarks(cases, {
    ...options,
    onHostRenderBoundary: (boundary) => {
      boundaries.push(boundary);
    },
  });
  // oxlint-disable-next-line promise/prefer-await-to-then -- Attach before the deliberately deferred rejection.
  const observedResult = result.catch(() => undefined);
  await vi.waitFor(() => {
    expect(boundaries.at(-1)?.phase).toBe('request-issued');
  });
  expect(boundaries.map(({ phase }) => phase)).toEqual(['before-open', 'after-open', 'after-view', 'request-issued']);
  expect(fixture.view.close).not.toHaveBeenCalled();
  expect(fixture.document.close).not.toHaveBeenCalled();
  const cancelled = new Error('diagnostic render cancelled');
  rendering.reject(cancelled);
  await expect(result).rejects.toBe(cancelled);
  await observedResult;
  expect(boundaries.map(({ phase }) => phase)).toEqual([
    'before-open',
    'after-open',
    'after-view',
    'request-issued',
    'await-settled',
    'document-closed',
  ]);
  expect(boundaries.every(({ timeOrigin, monotonic }) => Number.isFinite(timeOrigin + monotonic))).toBe(true);
  const times = boundaries.map(({ monotonic }) => monotonic);
  expect(times).toEqual(times.toSorted((a, b) => a - b));
  expect(boundaries.every(({ processCpu }) => processCpu.user >= 0 && processCpu.system >= 0)).toBe(true);
  expect(fixture.view.close).toHaveBeenCalledOnce();
  expect(fixture.document.close).toHaveBeenCalledOnce();
  expect(client.terminate).toHaveBeenCalledOnce();
});

it.each([{ stopFails: false }, { stopFails: true }])(
  'should stop an active V8 profile and preserve a deferred render rejection when stop failure is $stopFails',
  async ({ stopFails }) => {
    const client = createMockRuntimeClient();
    const fixture = createMockRuntimeDocument();
    vi.mocked(client.open).mockReturnValue(fixture.document);
    vi.mocked(createRuntimeClient).mockReturnValue(client);
    const rendering = Promise.withResolvers<Awaited<ReturnType<typeof fixture.view.rendering>>>();
    vi.mocked(fixture.view.rendering).mockReturnValue(rendering.promise);
    const start = vi.spyOn(CpuProfiler.prototype, 'start').mockResolvedValue();
    const stop = vi.spyOn(CpuProfiler.prototype, 'stop').mockImplementation(async () => {
      if (stopFails) {
        throw new Error('profile stop refused');
      }
      return { nodes: [], startTime: 0, endTime: 0, samples: [], timeDeltas: [] };
    });
    const boundaries: HostRenderBoundary[] = [];
    try {
      const result = runBenchmarks(cases, {
        ...options,
        cpuProfile: true,
        onHostRenderBoundary: (boundary) => boundaries.push(boundary),
      });
      // oxlint-disable-next-line promise/prefer-await-to-then -- Observe the intentionally deferred rejection before triggering it.
      const observedResult = result.catch(() => undefined);
      await vi.waitFor(() => {
        expect(boundaries.at(-1)?.phase).toBe('request-issued');
      });
      expect(boundaries[0]?.phase).toBe('profile-started');
      expect(start).toHaveBeenCalledOnce();
      const cancelled = new Error('profiled render cancelled');
      rendering.reject(cancelled);
      await expect(result).rejects.toBe(cancelled);
      await observedResult;
      expect(stop).toHaveBeenCalledOnce();
      expect(boundaries.at(-1)?.phase).toBe('document-closed');
      expect(fixture.view.close).toHaveBeenCalledOnce();
      expect(fixture.document.close).toHaveBeenCalledOnce();
      expect(client.terminate).toHaveBeenCalledOnce();
    } finally {
      start.mockRestore();
      stop.mockRestore();
    }
  },
);
