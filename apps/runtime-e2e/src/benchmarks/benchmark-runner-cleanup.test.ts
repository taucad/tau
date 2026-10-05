// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime/client';
import { createMockRuntimeClient, createMockRuntimeDocument } from '@taucad/runtime-testing';
import { runBenchmarks } from '#benchmarks/benchmark-runner.js';

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
