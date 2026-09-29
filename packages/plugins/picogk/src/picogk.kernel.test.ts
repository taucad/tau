// @vitest-environment node
import { createHash } from 'node:crypto';

import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createMockFileSystem, createMockKernelRuntime, expectKernelProjectionOrder } from '@taucad/runtime-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { picogkKernel } from '#picogk.kernel.js';
import { picogkExportSchemas, picogkOptionsSchema } from '#picogk.schemas.js';
import { PicogkWorkerError } from '#picogk-session.js';
import type { PicogkSession } from '#picogk-session.js';

const runtime = createMockKernelRuntime();
const kernelOptions = {
  workerExecutable: '/worker',
  workerSha256: 'a'.repeat(64),
  resourceFiles: [{ path: '/resource', sha256: 'b'.repeat(64), label: 'resource' }],
};
const triangle = (() => {
  const bytes = new Uint8Array(84);
  const view = new DataView(bytes.buffer);
  for (const [index, value] of [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1].entries()) {
    view.setFloat32(index * 4, value, true);
  }
  for (const [index, value] of [0, 1, 2].entries()) {
    view.setUint32(72 + index * 4, value, true);
  }
  return bytes;
})();

const compilationTimings = { cacheHit: false, sourceRead: 1, parse: 2, analyze: 3, emit: 4 };
const workerTimings = {
  compileCacheHit: true,
  sourceRead: 1,
  parse: 0,
  analyze: 0,
  emit: 0,
  libraryInitialize: 2,
  entryPointInvoke: 3,
  meshConstruction: 4,
  meshExtraction: 5,
  normalGeneration: 6,
  artifactWrite: 7,
  unload: 8,
};
const buildResult = (id = 'component:picogk-1') => ({
  artifactPath: '/private/model.tau-mesh',
  byteLength: triangle.byteLength,
  sha256: createHash('sha256').update(triangle).digest('hex'),
  components: [
    {
      id,
      kind: 'triangles',
      name: 'Part',
      color: [0x11 / 255, 0x22 / 255, 0x33 / 255, 1],
      metallic: 0.25,
      roughness: 0.75,
      positionOffset: 0,
      positionCount: 9,
      normalOffset: 36,
      normalCount: 9,
      indexOffset: 72,
      indexCount: 3,
    },
  ],
  recycleAfterResponse: false,
  timings: workerTimings,
  metrics: { managedHeapBytes: 10, picoGkNativeBytes: 0, processWorkingSetBytes: 20 },
});

const contextData = () => ({
  mirror: {
    sync: vi.fn().mockResolvedValue(['helper.cs', 'main.cs', 'asset.txt', 'tau.json', 'thumbnail.webp']),
    cleanup: vi.fn(),
  },
  session: {
    request: vi.fn(),
    readArtifact: vi.fn().mockResolvedValue(triangle),
    recycle: vi.fn(),
    cleanup: vi.fn(),
  },
});

/**
 * The worker methods a session fake was asked for, in order.
 *
 * @param request - The session's `request` spy.
 * @returns Each call's `method`.
 */
const requestedMethods = (request: ReturnType<typeof vi.fn>): string[] =>
  request.mock.calls.map(([call]) => (call as { readonly method: string }).method);

const workerError = (type: 'syntax' | 'validation' | 'runtime' | 'kernel') =>
  new PicogkWorkerError([
    {
      message: `${type} failed`,
      code: 'CS_TEST',
      type,
      severity: 'error',
      location: { fileName: 'main.cs', startLineNumber: 2, startColumn: 3 },
    },
  ]);

/**
 * The attributes one named span was ended with.
 *
 * @param name - Span name the kernel opened.
 * @returns What `end()` received, or undefined when no such span was opened.
 */
const endedSpanAttributes = (name: string): Record<string, unknown> | undefined => {
  const index = runtime.tracer.startSpan.mock.calls.findIndex(([spanName]) => spanName === name);
  if (index === -1) {
    return undefined;
  }
  // oxlint-disable-next-line typescript/no-unsafe-member-access -- the mock's own return value
  const end = runtime.tracer.startSpan.mock.results[index]?.value.end as ReturnType<typeof vi.fn>;
  return end.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
};

const loadDefinition = async () => resolveRuntimePluginDefinition('kernel', picogkKernel(kernelOptions));
// These hook tests need only the mirror and session methods they exercise.
const context = () =>
  contextData() as ReturnType<typeof contextData> &
    Parameters<Awaited<ReturnType<typeof loadDefinition>>['evaluate']>[2];

describe('PicoGK kernel', () => {
  let definition: Awaited<ReturnType<typeof loadDefinition>>;
  beforeEach(async () => {
    vi.clearAllMocks();
    definition = await loadDefinition();
  });

  it('never reads the generated root thumbnail during workspace discovery', async () => {
    const filesystem = createMockFileSystem({ readFileResult: 'x' });
    filesystem.mocks.readdirStat.mockImplementation(async (directory: string) =>
      directory === ''
        ? ['main.cs', 'thumbnail.webp', 'tau.json', 'package.json'].map(
            (name) =>
              ({
                type: 'file',
                size: 1,
                mtimeMs: 0,
                contentKind: 'text',
                lineCount: 1,
                path: name,
                name,
              }) as const,
          )
        : [],
    );
    const mirrorRuntime = { ...createMockKernelRuntime(), filesystem };
    const value = await definition.initialize(picogkOptionsSchema.parse(kernelOptions), mirrorRuntime);
    vi.spyOn((value as { readonly session: PicogkSession }).session, 'request').mockResolvedValue({
      sources: ['main.cs'],
    });
    try {
      await expect(definition.resolve({ entryPath: 'main.cs' }, mirrorRuntime, value)).resolves.toEqual({
        resolved: ['main.cs', 'package.json'],
        unresolved: [],
      });
      expect(filesystem.mocks.readFile.mock.calls).toEqual([
        ['main.cs', undefined],
        ['package.json', undefined],
        ['tau.json', undefined],
      ]);
    } finally {
      await definition.onDispose?.(value);
    }
  });

  it('owns C#, watches model inputs but not Tau system artifacts, and preserves issue provenance', async () => {
    const value = context();
    value.session.request.mockResolvedValueOnce({ sources: ['helper.cs', 'main.cs'] });
    await expect(definition.resolve({ entryPath: 'main.cs' }, runtime, value)).resolves.toEqual({
      resolved: ['helper.cs', 'main.cs', 'asset.txt'],
      unresolved: [],
    });
    // Another program in the project is its own model: never compiled, watched or hashed with this one.
    value.mirror.sync.mockResolvedValueOnce(['helper.cs', 'main.cs', 'other.cs', 'asset.txt', 'tau.json']);
    value.session.request.mockResolvedValueOnce({ sources: ['helper.cs', 'other.cs'] });
    await expect(definition.resolve({ entryPath: 'other.cs' }, runtime, value)).resolves.toEqual({
      resolved: ['helper.cs', 'other.cs', 'asset.txt'],
      unresolved: [],
    });
    expect(value.session.request).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: 'resolve', params: { entryPath: 'other.cs' } }),
    );
    // An entry the worker cannot select watches every input, so the edit that settles it re-renders it.
    value.mirror.sync.mockResolvedValueOnce(['helper.cs', 'main.cs', 'other.cs', 'asset.txt', 'tau.json']);
    value.session.request.mockRejectedValueOnce(workerError('validation'));
    await expect(definition.resolve({ entryPath: 'helper.cs' }, runtime, value)).resolves.toEqual({
      resolved: ['helper.cs', 'main.cs', 'other.cs', 'asset.txt'],
      unresolved: [],
    });
    value.session.request.mockRejectedValueOnce(new Error('worker exited'));
    await expect(definition.resolve({ entryPath: 'main.cs' }, runtime, value)).rejects.toMatchObject({
      issues: [expect.objectContaining({ message: 'worker exited', type: 'runtime' })],
    });
    value.mirror.sync.mockRejectedValueOnce(workerError('syntax'));
    await expect(definition.resolve({ entryPath: 'main.cs' }, runtime, value)).rejects.toMatchObject({
      issues: [
        expect.objectContaining({ type: 'compilation', details: { workerCode: 'CS_TEST', workerType: 'syntax' } }),
      ],
    });

    value.session.request.mockRejectedValueOnce(workerError('validation'));
    await expect(definition.describe({ entryPath: 'main.cs' }, runtime, value)).resolves.toMatchObject({
      success: false,
      issues: [expect.objectContaining({ type: 'compilation' })],
    });
    value.session.request.mockRejectedValueOnce('plain failure');
    await expect(definition.describe({ entryPath: 'main.cs' }, runtime, value)).resolves.toMatchObject({
      success: false,
      issues: [{ message: 'plain failure', type: 'runtime', location: { fileName: 'main.cs' } }],
    });
  });

  it('scopes each mirror sync to the runtime operation and asks each worker question once', async () => {
    const value = context();
    value.session.request.mockImplementation(async ({ method }: { method: string }) =>
      method === 'resolve'
        ? { sources: ['main.cs'] }
        : method === 'analyze'
          ? { defaultParameters: {}, jsonSchema: { type: 'object' }, timings: compilationTimings }
          : buildResult(),
    );
    const render = { ...runtime, operationId: 1 };

    await definition.resolve({ entryPath: 'main.cs' }, render, value);
    await definition.describe({ entryPath: 'main.cs' }, render, value);
    await definition.evaluate({ entryPath: 'main.cs', parameters: {}, options: {} }, render, value);

    // The mirror reuses its own walk per operation id.
    expect(value.mirror.sync.mock.calls.map((call): unknown => call[2])).toEqual([1, 1, 1]);
    expect(requestedMethods(value.session.request)).toEqual(['resolve', 'analyze', 'build']);
  });

  it('returns parameters, canonical inline geometry, immutable handles, and GLB exports', async () => {
    const value = context();
    value.session.request.mockResolvedValueOnce({
      defaultParameters: {},
      jsonSchema: { type: 'object' },
      timings: compilationTimings,
    });
    await expect(definition.describe({ entryPath: 'main.cs' }, runtime, value)).resolves.toMatchObject({
      success: true,
      data: { parameters: { defaults: {} } },
    });

    value.session.request.mockResolvedValueOnce(buildResult());
    const built = await definition.evaluate({ entryPath: 'main.cs', parameters: {}, options: {} }, runtime, value);
    /* D8: the C# stage timings are attributes on the span that measured the request, not a debug
     * log line, so the breakdown is answerable from the trace file with no log parsing. */
    expect(endedSpanAttributes('picogk.analyze')).toMatchObject(compilationTimings);
    expect(endedSpanAttributes('picogk.build')).toMatchObject(workerTimings);
    expect(runtime.tracer.startSpan.mock.calls.map(([name]) => String(name))).toContain('picogk.artifact-read');
    expect(runtime.logger.debug).not.toHaveBeenCalledWith(expect.stringContaining('performance'), expect.anything());
    // W17/D2: an aborted build stops the worker cooperatively, which is what the live-edit lane needs.
    expect(value.session.request).toHaveBeenLastCalledWith(expect.objectContaining({ cancelMethod: 'cancel' }));
    expect(definition.cancellation).toBe('cooperative');
    const handle = built.handle as { glb: Uint8Array<ArrayBuffer> };
    const artifact = await definition.render!({ view: 'model', handle, options: {} }, runtime, value);
    expect(handle.glb).toEqual(artifact.content);
    const serialized = definition.serializeHandle!({ handle }, runtime, value);
    const restored = definition.deserializeHandle!({ serialized }, runtime, value);
    expect(restored.glb).toEqual(handle.glb);
    expect(restored.glb).not.toBe(handle.glb);

    const exported = await definition.write!(
      { exportId: 'glb', handle, options: picogkExportSchemas.glb.parse({}) },
      runtime,
      value,
    );
    expect(exported).toMatchObject({ files: [{ name: 'model.glb' }] });
    const render = async (valueHandle: typeof handle) => {
      const projected = await definition.render!({ view: 'model', handle: valueHandle, options: {} }, runtime, value);
      return projected.content;
    };
    const write = async (valueHandle: typeof handle) => {
      const projected = await definition.write!(
        { exportId: 'glb', handle: valueHandle, options: picogkExportSchemas.glb.parse({}) },
        runtime,
        value,
      );
      return projected.files[0].bytes;
    };
    const ordered = await expectKernelProjectionOrder({
      renderA: async () => render(handle),
      renderB: async () => write(handle),
      freshB: async () => write(restored),
      write: async () => render(restored),
    });
    expect(ordered.first).toEqual(artifact.content);
    expect(ordered.intervening).toEqual(artifact.content);
  });

  it('recycles requested generations and returns structured build/export failures', async () => {
    const value = context();
    value.session.request.mockResolvedValueOnce({ ...buildResult(), recycleAfterResponse: true });
    await definition.evaluate({ entryPath: 'main.cs', parameters: {}, options: {} }, runtime, value);
    expect(value.session.recycle).toHaveBeenCalled();

    value.session.request.mockRejectedValueOnce(workerError('kernel'));
    await expect(
      definition.evaluate({ entryPath: 'main.cs', parameters: {}, options: {} }, runtime, value),
    ).rejects.toMatchObject({ issues: [expect.objectContaining({ type: 'kernel' })] });
    const badHandle = Object.defineProperty({}, 'glb', {
      get() {
        throw new Error('unreadable handle');
      },
    });
    await expect(
      definition.write!(
        {
          exportId: 'glb',
          handle: badHandle as { glb: Uint8Array<ArrayBuffer> },
          options: picogkExportSchemas.glb.parse({}),
        },
        runtime,
        value,
      ),
    ).rejects.toMatchObject({ issues: [expect.objectContaining({ type: 'runtime' })] });
  });

  it('always removes the mirror when session cleanup fails', async () => {
    const value = context();
    value.session.cleanup.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(definition.onDispose?.(value)).rejects.toThrow('cleanup failed');
    expect(value.mirror.cleanup).toHaveBeenCalled();
  });
});
