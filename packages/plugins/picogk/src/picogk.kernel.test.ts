/* oxlint-disable typescript/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
// @vitest-environment node
import { createHash } from 'node:crypto';
import { NodeIO, WebIO } from '@gltf-transform/core';

import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createMockFileSystem, createMockKernelRuntime, expectKernelProjectionOrder } from '@taucad/runtime-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { picogkBrowserKernel } from '#picogk-browser.kernel.js';
import { picogkKernel } from '#picogk.kernel.js';
import { createPicogkKernelDefinition } from '#picogk-kernel-definition.js';
import { picogkOptionsSchema } from '#picogk.schemas.js';
import { picogkExportSchemas, picogkRenderSchema } from '#picogk-render.schemas.js';
import { PicogkWorkerError } from '#picogk-worker-error.js';

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

const compilationTimings = {
  cacheHit: false,
  sourceRead: 1,
  parse: 2,
  analyze: 3,
  emit: 4,
};
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
// An explicit uniform view, which never asks the worker for meshing.
const uniform = picogkRenderSchema.parse({ meshAdaptivity: 0 });

const buildResult = (id = 'component:picogk-1') => ({
  artifactPath: '/private/model.tau-mesh',
  byteLength: triangle.byteLength,
  sha256: createHash('sha256').update(triangle).digest('hex'),
  prototypes: [
    {
      id: 'prototype:1',
      kind: 'triangles',
      positionOffset: 0,
      positionCount: 9,
      normalOffset: 36,
      normalCount: 9,
      indexOffset: 72,
      indexCount: 3,
      indexComponentType: 5125,
    },
  ],
  occurrences: [
    {
      id,
      prototypeId: 'prototype:1',
      name: 'Part',
      color: [0x11 / 255, 0x22 / 255, 0x33 / 255, 1],
      metallic: 0.25,
      roughness: 0.75,
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    },
  ],
  recycleAfterResponse: false,
  timings: workerTimings,
  metrics: {
    managedHeapBytes: 10,
    picoGkNativeBytes: 0,
    processWorkingSetBytes: 20,
  },
  voxelSize: 0.25,
});

const contextData = () => ({
  computeTransport: { dispose: vi.fn(), start: vi.fn() },
  mirror: {
    sync: vi.fn().mockResolvedValue(['helper.cs', 'main.cs', 'asset.txt', 'tau.json', 'thumbnail.webp']),
    cleanup: vi.fn(),
  },
  session: {
    request: vi.fn(),
    readArtifact: vi.fn().mockResolvedValue(triangle),
    recycle: vi.fn(),
    cleanup: vi.fn(),
    sampleResident: vi.fn().mockResolvedValue(64 * 1024 * 1024),
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

const loadDefinition = async () => resolveRuntimePluginDefinition('kernel', picogkKernel({ closure: kernelOptions }));
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
    const value = await definition.initialize(picogkOptionsSchema.parse({ closure: kernelOptions }), mirrorRuntime);
    vi.spyOn(value.session, 'request').mockResolvedValue({
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
    value.session.request.mockResolvedValueOnce({
      sources: ['helper.cs', 'main.cs'],
    });
    await expect(definition.resolve({ entryPath: 'main.cs' }, runtime, value)).resolves.toEqual({
      resolved: ['helper.cs', 'main.cs', 'asset.txt'],
      unresolved: [],
    });
    // Another program in the project is its own model: never compiled, watched or hashed with this one.
    value.mirror.sync.mockResolvedValueOnce(['helper.cs', 'main.cs', 'other.cs', 'asset.txt', 'tau.json']);
    value.session.request.mockResolvedValueOnce({
      sources: ['helper.cs', 'other.cs'],
    });
    await expect(definition.resolve({ entryPath: 'other.cs' }, runtime, value)).resolves.toEqual({
      resolved: ['helper.cs', 'other.cs', 'asset.txt'],
      unresolved: [],
    });
    expect(value.session.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'resolve',
        params: { entryPath: 'other.cs' },
      }),
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
        expect.objectContaining({
          type: 'compilation',
          details: { workerCode: 'CS_TEST', workerType: 'syntax' },
        }),
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
      issues: [
        {
          message: 'plain failure',
          type: 'runtime',
          location: { fileName: 'main.cs' },
        },
      ],
    });
  });

  it('scopes each mirror sync to the runtime operation and asks each worker question once', async () => {
    const value = context();
    value.session.request.mockImplementation(async ({ method }: { method: string }) =>
      method === 'resolve'
        ? { sources: ['main.cs'] }
        : method === 'analyze'
          ? {
              defaultParameters: {},
              jsonSchema: { type: 'object' },
              timings: compilationTimings,
            }
          : buildResult(),
    );
    const render = { ...runtime, operationId: 1 };

    await definition.resolve({ entryPath: 'main.cs' }, render, value);
    await definition.describe({ entryPath: 'main.cs' }, render, value);
    await definition.evaluate({ entryPath: 'main.cs', parameters: {}, options: uniform }, render, value);

    // The mirror reuses its own walk per operation id.
    expect(value.mirror.sync.mock.calls.map((call): unknown => call[0])).toEqual([render, render, render]);
    expect(requestedMethods(value.session.request)).toEqual(['resolve', 'analyze', 'build']);
  });

  it('should omit unavailable process memory from trace attributes', async () => {
    const value = context();
    const result = buildResult();
    value.session.request.mockResolvedValueOnce({
      ...result,
      metrics: { ...result.metrics, processWorkingSetBytes: null },
    });
    await definition.evaluate({ entryPath: 'main.cs', parameters: {}, options: uniform }, runtime, value);
    expect(endedSpanAttributes('picogk.build')).toMatchObject({ managedHeapBytes: 10, picoGkNativeBytes: 0 });
    expect(endedSpanAttributes('picogk.build')).not.toHaveProperty('processWorkingSetBytes');
  });

  it('preserves worker warnings and shared mechanism warnings alongside valid geometry', async () => {
    const value = context();
    value.session.request.mockResolvedValueOnce({
      ...buildResult(),
      warnings: [
        {
          message: 'Invalid authored mechanism; corrected properties can be retried',
          code: 'CS_TAU_MECHANISM',
          type: 'validation',
          severity: 'warning',
        },
      ],
      mechanism: { schemaVersion: 2 },
    });
    const result = await definition.evaluate(
      { entryPath: 'main.cs', parameters: {}, options: uniform },
      runtime,
      value,
    );
    expect(result.handle.glb).toBeInstanceOf(Uint8Array);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_ANNOTATION',
          severity: 'warning',
          details: {
            producer: { kernelId: 'picogk' },
            workerCode: 'CS_TAU_MECHANISM',
            workerType: 'validation',
          },
        }),
        expect.objectContaining({
          code: 'INVALID_ANNOTATION',
          severity: 'warning',
          details: expect.objectContaining({ mechanism: expect.any(Object) }),
        }),
      ]),
    );
  });

  it('sends adaptive meshing only above 0 and reports what the worker applied', async () => {
    const value = context();
    value.session.request.mockResolvedValueOnce(buildResult());
    await definition.evaluate({ entryPath: 'main.cs', parameters: {}, options: uniform }, runtime, value);
    expect(value.session.request).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: 'build', params: { entryPath: 'main.cs', parameters: {} } }),
    );

    const meshing = { adaptivity: 0.5, relax: true };
    value.session.request.mockResolvedValueOnce({ ...buildResult(), meshing });
    const built = await definition.evaluate(
      { entryPath: 'main.cs', parameters: {}, options: { meshAdaptivity: 0.5, meshRelax: true } },
      runtime,
      value,
    );
    expect(value.session.request).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: 'build', params: { entryPath: 'main.cs', parameters: {}, meshing } }),
    );
    const artifact = await definition.render!({ view: 'model', handle: built.handle, options: {} }, runtime, value);
    expect(artifact.tessellation).toMatchObject({ adaptivity: 0.5, relax: true });
    expect(
      definition.deserializeHandle!(
        { serialized: structuredClone(definition.serializeHandle!({ handle: built.handle }, runtime, value)) },
        runtime,
        value,
      ),
    ).toEqual(built.handle);
  });

  it('refuses an adaptive view from a worker that does not echo the meshing it applied', async () => {
    const value = context();
    for (const echoed of [undefined, { adaptivity: 0.5, relax: false }, { adaptivity: 0.25, relax: true }]) {
      value.session.request.mockResolvedValueOnce(echoed ? { ...buildResult(), meshing: echoed } : buildResult());
      // oxlint-disable-next-line no-await-in-loop -- each refusal is checked against its own worker reply.
      await expect(
        definition.evaluate(
          { entryPath: 'main.cs', parameters: {}, options: { meshAdaptivity: 0.5, meshRelax: true } },
          runtime,
          value,
        ),
      ).rejects.toMatchObject({
        issues: [
          {
            code: 'RUNTIME',
            type: 'kernel',
            severity: 'error',
            details: { reason: 'meshing-unsupported', meshAdaptivity: 0.5, meshRelax: true },
          },
        ],
      });
    }
  });

  it('asks for Balanced meshing when a view sets none and shows a worker that meshes adaptively', async () => {
    const value = context();
    const meshing = { adaptivity: 0.25, relax: false };
    value.session.request.mockResolvedValueOnce({ ...buildResult(), meshing });
    const built = await definition.evaluate(
      { entryPath: 'main.cs', parameters: {}, options: picogkRenderSchema.parse({}) },
      runtime,
      value,
    );
    expect(value.session.request).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: 'build', params: { entryPath: 'main.cs', parameters: {}, meshing } }),
    );
    expect(built.handle.tessellation).toMatchObject({ adaptivity: 0.25, relax: false });
  });

  it('accepts the uniform mesh of a worker without adaptive meshing for a view that sets none, built once', async () => {
    const value = context();
    value.session.request.mockResolvedValueOnce(buildResult());
    const built = await definition.evaluate(
      { entryPath: 'main.cs', parameters: {}, options: picogkRenderSchema.parse({ meshRelax: true }) },
      runtime,
      value,
    );
    expect(value.session.request.mock.calls.filter(([request]) => request.method === 'build')).toHaveLength(1);
    expect(value.session.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        params: { entryPath: 'main.cs', parameters: {}, meshing: { adaptivity: 0.25, relax: true } },
      }),
    );
    // The report states the mesh the worker built: uniform.
    expect(built.handle.tessellation).not.toHaveProperty('adaptivity');
    expect(built.handle.tessellation).not.toHaveProperty('relax');
  });

  it('reports the meshing a handle holds as its export build, and a report-less snapshot as nothing', () => {
    const glb = new Uint8Array(4);
    const tessellation = { triangles: 1, vertices: 3, elapsed: 1 };
    const options = picogkRenderSchema.parse({ meshRelax: true });
    const effective = (handle: Parameters<NonNullable<typeof definition.effectiveOptions>>[0]['handle']) =>
      definition.effectiveOptions!({ handle, options }, runtime, context());
    expect(effective({ glb, tessellation })).toEqual({ meshAdaptivity: 0, meshRelax: false });
    expect(effective({ glb, tessellation: { ...tessellation, adaptivity: 0.25, relax: true } })).toEqual({
      meshAdaptivity: 0.25,
      meshRelax: true,
    });
    expect(effective({ glb })).toBeUndefined();
    // A default export's construction options are exactly a uniform handle's, and an adaptive export's an adaptive one's.
    const exportMeshing = picogkExportSchemas.glb.pick({ meshAdaptivity: true, meshRelax: true });
    expect(exportMeshing.parse({})).toEqual(effective({ glb, tessellation }));
    expect(exportMeshing.parse({ meshAdaptivity: 0.25, meshRelax: true })).toEqual(
      effective({ glb, tessellation: { ...tessellation, adaptivity: 0.25, relax: true } }),
    );
  });

  it('refuses a defaulted view from a worker that echoes other meshing than it was asked for', async () => {
    const value = context();
    value.session.request.mockResolvedValueOnce({ ...buildResult(), meshing: { adaptivity: 0.5, relax: false } });
    await expect(
      definition.evaluate(
        { entryPath: 'main.cs', parameters: {}, options: picogkRenderSchema.parse({}) },
        runtime,
        value,
      ),
    ).rejects.toMatchObject({
      issues: [{ details: { reason: 'meshing-unsupported', meshAdaptivity: 0.25, meshRelax: false } }],
    });
  });

  it('refuses an explicit Balanced view from a worker without adaptive meshing', async () => {
    const value = context();
    value.session.request.mockResolvedValueOnce(buildResult());
    await expect(
      definition.evaluate(
        { entryPath: 'main.cs', parameters: {}, options: picogkRenderSchema.parse({ meshAdaptivity: 0.25 }) },
        runtime,
        value,
      ),
    ).rejects.toMatchObject({
      issues: [{ details: { reason: 'meshing-unsupported', meshAdaptivity: 0.25, meshRelax: false } }],
    });
  });

  it('leaves view adaptivity unset by default and meshes every export uniformly unless it asks', () => {
    expect(picogkRenderSchema.parse({})).toEqual({ meshRelax: false });
    expect(picogkRenderSchema.parse({ meshAdaptivity: 0 })).toEqual({ meshAdaptivity: 0, meshRelax: false });
    expect(picogkRenderSchema.safeParse({ meshAdaptivity: 1 }).success).toBe(false);
    expect(picogkRenderSchema.safeParse({ meshAdaptivity: -0.1 }).success).toBe(false);
    for (const schema of [picogkExportSchemas.glb, picogkExportSchemas.gltf]) {
      expect(schema.parse({})).toMatchObject({ meshAdaptivity: 0, meshRelax: false });
      expect(schema.parse({ meshAdaptivity: 0.5, meshRelax: true })).toMatchObject({
        meshAdaptivity: 0.5,
        meshRelax: true,
      });
      expect(schema.safeParse({ meshAdaptivity: 1 }).success).toBe(false);
      expect(schema.safeParse({ meshAdaptivity: -0.1 }).success).toBe(false);
    }
  });

  it('renders a protocol-8 worker build without a voxel size, and raises no issue for it', async () => {
    const value = context();
    const { voxelSize: _voxelSize, ...withoutVoxelSize } = buildResult();
    value.session.request.mockResolvedValueOnce(withoutVoxelSize);

    const built = await definition.evaluate({ entryPath: 'main.cs', parameters: {}, options: uniform }, runtime, value);
    const artifact = await definition.render!({ view: 'model', handle: built.handle, options: {} }, runtime, value);

    expect(built.issues).toEqual([]);
    expect(artifact.tessellation).toEqual({
      triangles: 1,
      vertices: 3,
      elapsed: workerTimings.meshConstruction + workerTimings.meshExtraction + workerTimings.normalGeneration,
    });
    expect(artifact.tessellation).not.toHaveProperty('voxelSize');
  });

  it('warns when a root .csproj references PicoGK at a version the kernel does not run', async () => {
    const value = context();
    value.mirror.sync.mockResolvedValueOnce(['Plate.csproj', 'main.cs', 'tools/Other.csproj']);
    value.session.request.mockResolvedValueOnce(buildResult());
    const project = createMockKernelRuntime({
      filesystemOverrides: {
        readFileResult: '<Project>\n  <PackageReference Include="PicoGK" Version="2.2.0" />\n</Project>\n',
      },
    });

    const result = await definition.evaluate(
      { entryPath: 'main.cs', parameters: {}, options: uniform },
      project,
      value,
    );

    expect(project.filesystem.mocks.readFile.mock.calls).toEqual([['Plate.csproj', 'utf8']]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'LIBRARY_VERSION_MISMATCH',
        severity: 'warning',
        location: { fileName: 'Plate.csproj', startLineNumber: 2, startColumn: 1 },
        details: {
          producer: { kernelId: 'picogk' },
          manifest: 'Plate.csproj',
          library: 'PicoGK',
          declared: '2.2.0',
          runs: '2.3.0',
        },
      }),
    ]);
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
    const built = await definition.evaluate({ entryPath: 'main.cs', parameters: {}, options: uniform }, runtime, value);
    /* D8: the C# stage timings are attributes on the span that measured the request, not a debug
     * log line, so the breakdown is answerable from the trace file with no log parsing. */
    expect(endedSpanAttributes('picogk.analyze')).toMatchObject(compilationTimings);
    expect(endedSpanAttributes('picogk.build')).toMatchObject(workerTimings);
    expect(runtime.tracer.startSpan.mock.calls.map(([name]) => String(name))).toContain('picogk.artifact-read');
    expect(runtime.logger.debug).not.toHaveBeenCalledWith(expect.stringContaining('performance'), expect.anything());
    // W17/D2: an aborted build stops the worker cooperatively, which is what the live-edit lane needs.
    expect(value.session.request).toHaveBeenLastCalledWith(expect.objectContaining({ cancelMethod: 'cancel' }));
    expect(definition.cancellation).toBe('cooperative');
    const { handle } = built;
    const artifact = await definition.render!({ view: 'model', handle, options: {} }, runtime, value);
    expect(handle.glb).toEqual(artifact.content);
    expect(artifact.tessellation).toEqual(handle.tessellation);
    expect(artifact.tessellation).toEqual({
      triangles: 1,
      vertices: 3,
      elapsed: workerTimings.meshConstruction + workerTimings.meshExtraction + workerTimings.normalGeneration,
      voxelSize: 0.25,
    });
    const serialized = definition.serializeHandle!({ handle }, runtime, value);
    const restored = definition.deserializeHandle!({ serialized: structuredClone(serialized) }, runtime, value);
    expect(restored).toEqual(handle);
    expect(restored.glb).not.toBe(handle.glb);
    // A snapshot written before the report existed is its GLB bytes alone and restores without one.
    expect(definition.deserializeHandle!({ serialized: new Uint8Array(handle.glb) }, runtime, value)).toEqual({
      glb: handle.glb,
    });
    // A snapshot written before the report carried the voxel size still restores, without one.
    const { voxelSize: _voxelSize, ...withoutVoxelSize } = handle.tessellation!;
    expect(
      definition.deserializeHandle!(
        { serialized: { glb: handle.glb, tessellation: withoutVoxelSize } },
        runtime,
        value,
      ),
    ).toEqual({ glb: handle.glb, tessellation: withoutVoxelSize });
    const restoreWithVoxelSize = (voxelSize: number) => () =>
      definition.deserializeHandle!(
        { serialized: { glb: handle.glb, tessellation: { ...handle.tessellation!, voxelSize } } },
        runtime,
        value,
      );
    for (const voxelSize of [0, -1, Number.POSITIVE_INFINITY]) {
      expect(restoreWithVoxelSize(voxelSize)).toThrow();
    }
    expect(() =>
      definition.deserializeHandle!(
        { serialized: { glb: handle.glb, tessellation: { ...handle.tessellation!, triangles: -1 } } },
        runtime,
        value,
      ),
    ).toThrow();

    const exported = await definition.export!(
      { exportId: 'glb', handle, options: picogkExportSchemas.glb.parse({}) },
      runtime,
      value,
    );
    expect(exported).toMatchObject({ files: [{ name: 'model.glb' }] });
    const binaryWrites = vi.spyOn(WebIO.prototype, 'writeBinary');
    try {
      const jsonExport = await definition.export!(
        {
          exportId: 'gltf',
          handle,
          options: picogkExportSchemas.gltf.parse({ coordinateSystem: 'z-up' }),
        },
        runtime,
        value,
      );
      expect(jsonExport.files).toHaveLength(1);
      expect(jsonExport.files[0].name).toBe('model.gltf');
      const document = await new NodeIO().readJSON({
        json: JSON.parse(new TextDecoder().decode(jsonExport.files[0].bytes)),
        resources: {},
      });
      expect(document.getRoot().listMeshes()).toHaveLength(1);
      expect(
        document
          .getRoot()
          .listNodes()
          .map((node) => node.getName()),
      ).toEqual(['Part']);
      expect(binaryWrites).not.toHaveBeenCalled();
    } finally {
      binaryWrites.mockRestore();
    }

    const render = async (valueHandle: typeof handle) => {
      const projected = await definition.render!({ view: 'model', handle: valueHandle, options: {} }, runtime, value);
      return projected.content;
    };
    const exportModel = async (valueHandle: typeof handle) => {
      const projected = await definition.export!(
        {
          exportId: 'glb',
          handle: valueHandle,
          options: picogkExportSchemas.glb.parse({}),
        },
        runtime,
        value,
      );
      return projected.files[0].bytes;
    };
    const ordered = await expectKernelProjectionOrder({
      renderA: async () => render(handle),
      renderB: async () => exportModel(handle),
      freshB: async () => exportModel(restored),
      export: async () => render(restored),
    });
    expect(ordered.first).toEqual(artifact.content);
    expect(ordered.intervening).toEqual(artifact.content);
  });

  it('recycles requested generations and returns structured build/export failures', async () => {
    const value = context();
    value.session.request.mockResolvedValueOnce({
      ...buildResult(),
      recycleAfterResponse: true,
    });
    await definition.evaluate({ entryPath: 'main.cs', parameters: {}, options: uniform }, runtime, value);
    expect(value.session.recycle).toHaveBeenCalled();

    value.session.request.mockRejectedValueOnce(workerError('kernel'));
    await expect(
      definition.evaluate({ entryPath: 'main.cs', parameters: {}, options: uniform }, runtime, value),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ type: 'kernel' })],
    });
    const badHandle = Object.defineProperty({}, 'glb', {
      get() {
        throw new Error('unreadable handle');
      },
    });
    await expect(
      definition.export!(
        {
          exportId: 'glb',
          handle: badHandle as { glb: Uint8Array<ArrayBuffer> },
          options: picogkExportSchemas.glb.parse({}),
        },
        runtime,
        value,
      ),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ type: 'runtime' })],
    });
  });

  it('releases the native session and mirror when compute disposal fails', async () => {
    const value = context();
    value.computeTransport.dispose.mockImplementationOnce(() => {
      throw new Error('compute disposal failed');
    });
    await expect(definition.onDispose?.(value)).rejects.toThrow('compute disposal failed');
    expect(value.session.cleanup).toHaveBeenCalledOnce();
    expect(value.mirror.cleanup).toHaveBeenCalledOnce();
  });

  it("reports its worker tree's resident set through the observation hook and never through heapBytes", async () => {
    const value = context();
    await expect(definition.observedChildResidentBytes?.(value)).resolves.toBe(64 * 1024 * 1024);
    expect(value.session.sampleResident).toHaveBeenCalledOnce();
    // The recycling input stays unimplemented, so `rendering.heapBytes` and the recycle policy are unchanged.
    expect(definition.heapBytes).toBeUndefined();
    expect(definition.observedHeapBytes).toBeUndefined();
  });

  it('always removes the mirror when session cleanup fails', async () => {
    const value = context();
    value.session.cleanup.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(definition.onDispose?.(value)).rejects.toThrow('cleanup failed');
    expect(value.mirror.cleanup).toHaveBeenCalled();
  });
});

describe('authored exports', () => {
  it('should retain original file bytes through handle serialization and preserve ordinary exports', async () => {
    const value = context();
    const original = new Uint8Array([0, 255, 1, 128]);
    const output = {
      artifactPath: `/artifacts/authored/${'a'.repeat(32)}/files/original.stl`,
      name: 'original.stl',
      byteLength: original.length,
      sha256: 'b'.repeat(64),
      mimeType: 'model/stl',
    };
    value.session.request.mockResolvedValue({ ...buildResult(), authoredOutputs: [output] });
    value.session.readArtifact.mockResolvedValueOnce(triangle).mockResolvedValueOnce(original);
    const factory = createPicogkKernelDefinition({
      optionsSchema: picogkOptionsSchema,
      version: 'test-authored-files',
      authoredOutputs: true,
      initialize: async () => value,
    });
    const definition = await resolveRuntimePluginDefinition('kernel', factory({ closure: kernelOptions }));
    const built = await definition.evaluate({ entryPath: 'main.cs', parameters: {}, options: uniform }, runtime, value);
    expect(built.exports).toEqual(['glb', 'gltf', 'authoredStl']);
    expect(value.session.readArtifact).toHaveBeenLastCalledWith(output);
    const serialized = definition.serializeHandle!({ handle: built.handle }, runtime, value);
    const restored = definition.deserializeHandle!({ serialized: structuredClone(serialized) }, runtime, value);
    original.fill(9);
    const exported = await definition.export!(
      { handle: restored, exportId: 'authoredStl', options: {} },
      runtime,
      value,
    );
    expect(exported.files).toEqual([
      { name: 'original.stl', mimeType: 'model/stl', bytes: new Uint8Array([0, 255, 1, 128]) },
    ]);
    await expect(
      definition.export!({ handle: restored, exportId: 'authoredVdb', options: {} }, runtime, value),
    ).rejects.toThrow('at least one file');
  });

  // The desktop worker collects the author's own geometry as the browser worker does, so the two
  // kernels must offer the same export identities rather than the browser offering two more.
  it('should declare the same exports on the desktop kernel as the browser kernel', async () => {
    const nativeDefinition = await loadDefinition();
    expect(Object.keys(nativeDefinition.exports)).toEqual(['authoredStl', 'authoredVdb', 'glb', 'gltf']);
    const browserDefinition = await resolveRuntimePluginDefinition('kernel', picogkBrowserKernel());
    expect(Object.keys(nativeDefinition.exports)).toEqual(Object.keys(browserDefinition.exports));
  });

  // A layer published before that change reports no authored outputs, and the kernel must then
  // offer none for that build rather than an export identity it cannot serve.
  it('should offer no authored export for a build that reported none', async () => {
    const value = context();
    value.session.request.mockResolvedValue(buildResult());
    value.session.readArtifact.mockResolvedValue(triangle);
    const factory = createPicogkKernelDefinition({
      optionsSchema: picogkOptionsSchema,
      version: 'test-authored-absent',
      authoredOutputs: true,
      initialize: async () => value,
    });
    const definition = await resolveRuntimePluginDefinition('kernel', factory({ closure: kernelOptions }));
    const built = await definition.evaluate({ entryPath: 'main.cs', parameters: {}, options: uniform }, runtime, value);
    expect(built.exports).toEqual(['glb', 'gltf']);
  });
});
