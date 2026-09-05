/* oxlint-disable typescript/no-unsafe-assignment -- private kernel context is intentionally erased by the public definition. */
// @vitest-environment node
import { createHash } from 'node:crypto';

import { actionDigest, canonicalizeComputeAction, contentDigest } from '@taucad/cache-core';
import type { ComputeAction } from '@taucad/cache-core';
import type { AnyKernelDefinition, KernelComputeSessionLookup } from '@taucad/runtime/kernel';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createMockFileSystem, createMockKernelRuntime } from '@taucad/runtime-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { picogkKernel } from '#picogk.kernel.js';
import { PicogkWorkerError } from '#picogk-session.js';

const runtime = createMockKernelRuntime();
const voxelCacheKey = `voxels:sha256:${'1'.repeat(64)}`;
const kernelOptions = {
  workerExecutable: '/worker',
  workerSha256: 'a'.repeat(64),
  trustFile: '/trust.json',
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
  checkpoints: [{ path: 'preview.tga', sceneGeneration: 1 }],
  recycleAfterResponse: false,
  timings: workerTimings,
  metrics: { managedHeapBytes: 10, picoGkNativeBytes: 0, processWorkingSetBytes: 20 },
});

const sceneArtifact = (artifactPath: string, id = 'component:picogk-1') => {
  const { byteLength, sha256, components } = buildResult(id);
  return { artifactPath, byteLength, sha256, components };
};

const context = () => ({
  mirror: {
    sync: vi.fn().mockResolvedValue(['helper.cs', 'main.cs', 'asset.txt', 'tau.json', 'thumbnail.webp']),
    cleanup: vi.fn(),
  },
  session: {
    request: vi.fn(),
    readArtifact: vi.fn().mockResolvedValue(triangle),
    prehydrateCompute: vi.fn().mockResolvedValue([]),
    recycle: vi.fn(),
    cleanup: vi.fn(),
  },
  computeAssets: { workerSha256: 'a'.repeat(64), resourceSha256: ['b'.repeat(64)] },
});

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

describe('PicoGK kernel', () => {
  let definition: AnyKernelDefinition;
  beforeEach(async () => {
    vi.clearAllMocks();
    definition = await resolveRuntimePluginDefinition('kernel', picogkKernel(kernelOptions));
  });

  it('never stats the generated root thumbnail during workspace discovery', async () => {
    const filesystem = createMockFileSystem({
      readdirResult: ['main.cs', 'thumbnail.webp', 'tau.json', 'package.json'],
      readFileResult: 'x',
    });
    filesystem.mocks.lstat.mockImplementation(async (path: string) => {
      if (path === 'thumbnail.webp') {
        throw new Error('Generated thumbnail changed');
      }
      return { type: 'file', size: 1, mtimeMs: 0, contentKind: 'text' };
    });
    const mirrorRuntime = { ...createMockKernelRuntime(), filesystem };
    const value = await definition.initialize(kernelOptions, mirrorRuntime);
    try {
      await expect(definition.getDependencies({ entryPath: 'main.cs' }, mirrorRuntime, value)).resolves.toEqual({
        resolved: ['main.cs', 'package.json'],
        unresolved: [],
      });
      expect(filesystem.mocks.readFile.mock.calls).toEqual([
        ['main.cs', undefined],
        ['package.json', undefined],
        ['tau.json', undefined],
      ]);
    } finally {
      await definition.cleanup?.(value);
    }
  });

  it('owns C#, watches model inputs but not Tau system artifacts, and preserves issue provenance', async () => {
    const value = context();
    await expect(definition.getDependencies({ entryPath: 'main.cs' }, runtime, value)).resolves.toEqual({
      resolved: ['helper.cs', 'main.cs', 'asset.txt'],
      unresolved: [],
    });
    value.mirror.sync.mockRejectedValueOnce(workerError('syntax'));
    await expect(definition.getDependencies({ entryPath: 'main.cs' }, runtime, value)).rejects.toMatchObject({
      issues: [
        expect.objectContaining({ type: 'compilation', details: { workerCode: 'CS_TEST', workerType: 'syntax' } }),
      ],
    });

    value.session.request.mockRejectedValueOnce(workerError('validation'));
    await expect(definition.getParameters({ entryPath: 'main.cs' }, runtime, value)).resolves.toMatchObject({
      success: false,
      issues: [expect.objectContaining({ type: 'compilation' })],
    });
    value.session.request.mockRejectedValueOnce('plain failure');
    await expect(definition.getParameters({ entryPath: 'main.cs' }, runtime, value)).resolves.toMatchObject({
      success: false,
      issues: [{ message: 'plain failure', type: 'runtime', location: { fileName: 'main.cs' } }],
    });
  });

  it('returns parameters, canonical inline geometry, immutable handles, and GLB exports', async () => {
    const value = context();
    value.session.request.mockResolvedValueOnce({
      defaultParameters: {},
      jsonSchema: { type: 'object' },
      timings: compilationTimings,
    });
    await expect(definition.getParameters({ entryPath: 'main.cs' }, runtime, value)).resolves.toMatchObject({
      success: true,
      data: { defaultParameters: {} },
    });

    value.session.request.mockResolvedValueOnce(buildResult());
    const built = await definition.createGeometry(
      { entryPath: 'main.cs', parameters: {}, options: {} },
      runtime,
      value,
    );
    expect(runtime.logger.debug).toHaveBeenCalledWith(
      'PicoGK C# analysis performance',
      expect.objectContaining({ data: expect.objectContaining(compilationTimings) }),
    );
    expect(runtime.logger.debug).toHaveBeenCalledWith(
      'PicoGK C# build performance',
      expect.objectContaining({
        data: expect.objectContaining({
          ...workerTimings,
          artifactRead: expect.any(Number),
          glbTransform: expect.any(Number),
        }),
      }),
    );
    expect(built.geometry).toMatchObject({ format: 'gltf' });
    expect(value.session.prehydrateCompute).toHaveBeenCalledOnce();
    expect(value.session.request).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ compute: expect.objectContaining({ prepared: [] }) }),
      }),
    );
    const handle = built.nativeHandle as { glb: Uint8Array<ArrayBuffer> };
    expect(handle.glb).toEqual((built.geometry as { content: Uint8Array<ArrayBuffer> }).content);
    const serialized = definition.serializeNativeHandle?.({ nativeHandle: handle }, runtime, value);
    const restored = definition.deserializeNativeHandle?.(
      { serializedNativeHandle: serialized },
      runtime,
      value,
    ) as typeof handle;
    expect(restored.glb).toEqual(handle.glb);
    expect(restored.glb).not.toBe(handle.glb);

    const exported = await definition.exportGeometry(
      { format: 'glb', nativeHandle: handle, options: {} },
      runtime,
      value,
    );
    expect(exported).toMatchObject({ success: true, data: [{ name: 'model.glb' }] });
  });

  it('publishes validated reset snapshots and bookmarks before the terminal geometry settles', async () => {
    const scene = {
      requested: true,
      publish: vi.fn(async (_input: unknown): Promise<{ type: 'not-requested' }> => ({ type: 'not-requested' })),
      publishUpdate: vi.fn(async (_input: unknown): Promise<{ type: 'not-requested' }> => ({ type: 'not-requested' })),
      bookmark: vi.fn(async (_input: unknown): Promise<{ type: 'not-requested' }> => ({ type: 'not-requested' })),
      flush: vi.fn(async () => undefined),
    };
    const progressRuntime = { ...createMockKernelRuntime(), scene };
    const value = context();
    const terminal = Promise.withResolvers<ReturnType<typeof buildResult>>();
    value.session.request.mockImplementationOnce(async (request: { events: { onEvent: (event: unknown) => void } }) => {
      request.events.onEvent({
        kind: 'scene',
        mode: 'explicit',
        operation: 'reset',
        baseSceneGeneration: null,
        sceneGeneration: 1,
        artifact: sceneArtifact('/private/progress.tau-mesh'),
        removedComponentIds: [],
        presentation: { background: [0.1, 0.2, 0.3, 1], fieldOfViewDegrees: 60 },
        bookmark: { path: 'preview.tga', sceneGeneration: 1 },
      });
      return terminal.promise;
    });

    const building = definition.createGeometry(
      {
        entryPath: 'main.cs',
        parameters: {},
        options: {
          capture: { mode: 'explicit', minimumIntervalMilliseconds: 0, maximumPendingCommands: 1 },
        },
      },
      progressRuntime,
      value,
    );
    await vi.waitFor(() => {
      expect(scene.publishUpdate).toHaveBeenCalledOnce();
    });
    expect(scene.publishUpdate).toHaveBeenCalledWith({
      operation: 'reset',
      sceneGeneration: 1,
      upserts: [
        {
          id: 'component:picogk-1',
          name: 'Part',
          geometry: { format: 'gltf', content: expect.any(Uint8Array) },
        },
      ],
      removedComponentIds: [],
      presentation: { background: [0.1, 0.2, 0.3, 1], fieldOfViewDegrees: 60 },
    });
    expect(scene.bookmark).toHaveBeenCalledWith({ label: 'preview.tga', source: 'explicit' });
    terminal.resolve(buildResult());
    const built = await building;
    expect(built).toMatchObject({ geometry: { format: 'gltf' } });
    const publication = scene.publishUpdate.mock.calls[0]![0] as {
      upserts: [{ geometry: { content: Uint8Array<ArrayBuffer> } }];
    };
    expect(publication.upserts[0].geometry.content).toEqual(
      (built.geometry as { content: Uint8Array<ArrayBuffer> }).content,
    );
    expect(scene.flush).toHaveBeenCalledOnce();
  });

  it('transfers only dirty components and reuses unchanged stable ids across deltas', async () => {
    const scene = {
      requested: true,
      publish: vi.fn(async (_input: unknown): Promise<{ type: 'not-requested' }> => ({ type: 'not-requested' })),
      publishUpdate: vi.fn(async (_input: unknown): Promise<{ type: 'not-requested' }> => ({ type: 'not-requested' })),
      bookmark: vi.fn(async (_input: unknown): Promise<{ type: 'not-requested' }> => ({ type: 'not-requested' })),
      flush: vi.fn(async () => undefined),
    };
    const progressRuntime = { ...createMockKernelRuntime(), scene };
    const value = context();
    value.session.request.mockImplementationOnce(async (request: { events: { onEvent: (event: unknown) => void } }) => {
      request.events.onEvent({
        kind: 'scene',
        mode: 'explicit',
        operation: 'reset',
        baseSceneGeneration: null,
        sceneGeneration: 1,
        artifact: sceneArtifact('/private/retained.tau-mesh', 'component:picogk-1'),
        removedComponentIds: [],
        presentation: {},
        bookmark: null,
      });
      request.events.onEvent({
        kind: 'scene',
        mode: 'explicit',
        operation: 'delta',
        baseSceneGeneration: 1,
        sceneGeneration: 2,
        artifact: sceneArtifact('/private/added.tau-mesh', 'component:picogk-2'),
        removedComponentIds: [],
        presentation: null,
        bookmark: null,
      });
      request.events.onEvent({
        kind: 'scene',
        mode: 'explicit',
        operation: 'delta',
        baseSceneGeneration: 2,
        sceneGeneration: 3,
        artifact: sceneArtifact('/private/moved.tau-mesh', 'component:picogk-2'),
        removedComponentIds: [],
        presentation: null,
        bookmark: null,
      });
      request.events.onEvent({
        kind: 'scene',
        mode: 'explicit',
        operation: 'delta',
        baseSceneGeneration: 3,
        sceneGeneration: 3,
        artifact: null,
        removedComponentIds: [],
        presentation: null,
        bookmark: { path: 'unchanged.tga', sceneGeneration: 3 },
      });
      request.events.onEvent({
        kind: 'scene',
        mode: 'explicit',
        operation: 'delta',
        baseSceneGeneration: 3,
        sceneGeneration: 4,
        artifact: null,
        removedComponentIds: ['component:picogk-1'],
        presentation: null,
        bookmark: null,
      });
      return buildResult('component:picogk-2');
    });

    await definition.createGeometry({ entryPath: 'main.cs', parameters: {}, options: {} }, progressRuntime, value);

    expect(scene.publishUpdate.mock.calls.map(([input]) => input)).toMatchObject([
      {
        operation: 'reset',
        upserts: [{ id: 'component:picogk-1' }],
        removedComponentIds: [],
      },
      {
        operation: 'delta',
        baseSceneGeneration: 1,
        upserts: [{ id: 'component:picogk-2' }],
        removedComponentIds: [],
      },
      {
        operation: 'delta',
        baseSceneGeneration: 2,
        upserts: [{ id: 'component:picogk-2' }],
        removedComponentIds: [],
      },
      {
        operation: 'delta',
        baseSceneGeneration: 3,
        upserts: [],
        removedComponentIds: ['component:picogk-1'],
      },
    ]);
    const artifactReads = value.session.readArtifact.mock.calls as Array<[{ readonly artifactPath: string }]>;
    expect(artifactReads.map(([descriptor]) => descriptor.artifactPath)).toEqual([
      '/private/retained.tau-mesh',
      '/private/added.tau-mesh',
      '/private/moved.tau-mesh',
      '/private/model.tau-mesh',
    ]);
    expect(scene.bookmark).toHaveBeenCalledWith({ label: 'unchanged.tga', source: 'explicit' });
    expect(scene.flush).toHaveBeenCalledOnce();
  });

  it('recycles requested generations and returns structured build/export failures', async () => {
    const value = context();
    value.session.request.mockResolvedValueOnce({ ...buildResult(), recycleAfterResponse: true });
    await definition.createGeometry({ entryPath: 'main.cs', parameters: {}, options: {} }, runtime, value);
    expect(value.session.recycle).toHaveBeenCalled();

    value.session.request.mockRejectedValueOnce(workerError('kernel'));
    await expect(
      definition.createGeometry({ entryPath: 'main.cs', parameters: {}, options: {} }, runtime, value),
    ).rejects.toMatchObject({ issues: [expect.objectContaining({ type: 'kernel' })] });
    const badHandle = Object.defineProperty({}, 'glb', {
      get() {
        throw new Error('unreadable handle');
      },
    });
    const badExport = await definition.exportGeometry(
      { format: 'glb', nativeHandle: badHandle, options: {} },
      runtime,
      value,
    );
    expect(badExport).toMatchObject({ success: false, issues: [expect.objectContaining({ type: 'runtime' })] });
  });

  it('publishes managed component misses only after a successful final build', async () => {
    const record = vi.fn(
      () =>
        ({
          status: 'staged',
          actionDigest: actionDigest({ value: `sha256:${'d'.repeat(64)}` }),
        }) as const,
    );
    const flush = vi.fn(async () => undefined);
    const cacheRuntime = {
      ...createMockKernelRuntime(),
      compute: {
        ...runtime.compute,
        openSession: vi.fn(async () => ({
          prepared: () => [],
          lookup: () => ({ status: 'miss' }) as const,
          record,
          flush,
        })),
      },
    };
    const value = context();
    value.session.request.mockResolvedValueOnce({
      ...buildResult(),
      computePublications: [
        {
          cacheKey: voxelCacheKey,
          kind: 'triangles',
          artifactPath: '/private/component.tau-compute',
          byteLength: triangle.byteLength,
          sha256: createHash('sha256').update(triangle).digest('hex'),
          positionCount: 18,
          indexCount: 3,
        },
      ],
    });
    await definition.createGeometry({ entryPath: 'main.cs', parameters: {}, options: {} }, cacheRuntime, value);
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ namespace: 'picogk.component-materialization.v2' }),
        bytes: triangle,
      }),
    );
    expect(flush).toHaveBeenCalledOnce();

    record.mockClear();
    flush.mockClear();
    value.session.request.mockRejectedValueOnce(new Error('worker failed'));
    await expect(
      definition.createGeometry({ entryPath: 'main.cs', parameters: {}, options: {} }, cacheRuntime, value),
    ).rejects.toThrow('worker failed');
    expect(record).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it('should reuse exact component actions across source and parameter edits while excluding historical producers', async () => {
    const key = actionDigest({ value: `sha256:${'c'.repeat(64)}` });
    const digest = contentDigest({ value: `sha256:${'d'.repeat(64)}` });
    const record = vi.fn((_input: { action: ComputeAction }) => ({ status: 'staged', actionDigest: key }) as const);
    const prepared: Array<{
      canonicalAction: string;
      bytes: Uint8Array<ArrayBuffer>;
      actionDigest: typeof key;
      contentDigest: typeof digest;
    }> = [];
    const lookup = vi.fn<() => KernelComputeSessionLookup>(
      () => ({ status: 'hit', source: 'cache', bytes: triangle, actionDigest: key, contentDigest: digest }) as const,
    );
    const cacheRuntime = {
      ...createMockKernelRuntime(),
      compute: {
        ...runtime.compute,
        openSession: vi.fn(async () => ({
          prepared: () => prepared,
          lookup,
          record,
          flush: vi.fn(async () => undefined),
        })),
      },
    };
    const value = context();
    let source = 'first source';
    cacheRuntime.filesystem.readFiles = async (paths) =>
      Object.fromEntries(paths.map((path) => [path, new TextEncoder().encode(source)]));
    value.session.request.mockResolvedValueOnce({
      ...buildResult(),
      computePublications: [
        {
          cacheKey: voxelCacheKey,
          kind: 'triangles',
          artifactPath: '/private/component.tau-compute',
          byteLength: triangle.byteLength,
          sha256: createHash('sha256').update(triangle).digest('hex'),
          positionCount: 18,
          indexCount: 3,
        },
      ],
    });
    await definition.createGeometry({ entryPath: 'main.cs', parameters: {}, options: {} }, cacheRuntime, value);
    const { action } = record.mock.calls[0]![0];
    expect(action.inputs).toEqual([{ kind: 'content', role: 'geometry', digest: `sha256:${'1'.repeat(64)}` }]);
    expect(action.arguments).toMatchObject({ geometryKind: 'voxels' });
    expect(cacheRuntime.compute.openSession).toHaveBeenCalledWith({
      namespace: 'picogk.component-materialization.v2',
      scope: { producer: action.producer },
      policy: 'best-effort',
    });
    const historical = {
      ...action,
      producer: { ...action.producer, implementationAssets: [contentDigest({ value: `sha256:${'e'.repeat(64)}` })] },
    };
    const invalidDigestAction = {
      ...action,
      arguments: { cacheKey: '1:voxels', kind: 'triangles', positionCount: 18, indexCount: 3, geometryKind: 'voxels' },
    };
    for (const candidate of [historical, invalidDigestAction, action]) {
      prepared.push({
        canonicalAction: canonicalizeComputeAction(candidate),
        bytes: triangle,
        actionDigest: key,
        contentDigest: digest,
      });
    }
    value.session.prehydrateCompute.mockClear();
    value.session.request.mockResolvedValue(buildResult());
    source = 'edited source';
    await definition.createGeometry(
      { entryPath: 'main.cs', parameters: { radius: 7 }, options: {} },
      cacheRuntime,
      value,
    );
    expect(cacheRuntime.compute.openSession).toHaveBeenLastCalledWith({
      namespace: 'picogk.component-materialization.v2',
      scope: { producer: action.producer },
      policy: 'best-effort',
    });
    expect(lookup).toHaveBeenCalledExactlyOnceWith({ action });
    expect(value.session.prehydrateCompute).toHaveBeenCalledExactlyOnceWith([
      {
        identity: { cacheKey: voxelCacheKey, kind: 'triangles', positionCount: 18, indexCount: 3 },
        bytes: triangle,
        contentDigest: digest,
      },
    ]);
    lookup.mockReturnValueOnce({ status: 'miss' });
    value.session.prehydrateCompute.mockClear();
    await definition.createGeometry({ entryPath: 'main.cs', parameters: {}, options: {} }, cacheRuntime, value);
    expect(value.session.prehydrateCompute).toHaveBeenCalledExactlyOnceWith([]);
    lookup.mockReturnValueOnce({ status: 'hit', source: 'session', bytes: triangle, actionDigest: key });
    value.session.prehydrateCompute.mockClear();
    await definition.createGeometry({ entryPath: 'main.cs', parameters: {}, options: {} }, cacheRuntime, value);
    expect(value.session.prehydrateCompute).toHaveBeenCalledExactlyOnceWith([]);
    prepared.pop();
    lookup.mockClear();
    value.session.prehydrateCompute.mockClear();
    await definition.createGeometry({ entryPath: 'main.cs', parameters: {}, options: {} }, cacheRuntime, value);
    expect(lookup).not.toHaveBeenCalled();
    expect(value.session.prehydrateCompute).toHaveBeenCalledExactlyOnceWith([]);
  });

  it.each(['1:voxels', 'mesh:sha256:bad', `lines:sha256:${'1'.repeat(64)}`])(
    'should reject invalid component digest key %s before publishing cache data',
    async (cacheKey) => {
      const record = vi.fn();
      const cacheRuntime = {
        ...createMockKernelRuntime(),
        compute: {
          ...runtime.compute,
          openSession: vi.fn(async () => ({
            prepared: () => [],
            lookup: () => ({ status: 'miss' }) as const,
            record,
            flush: vi.fn(async () => undefined),
          })),
        },
      };
      const value = context();
      value.session.request.mockResolvedValueOnce({
        ...buildResult(),
        computePublications: [
          {
            cacheKey,
            kind: 'triangles',
            artifactPath: '/private/component.tau-compute',
            byteLength: triangle.byteLength,
            sha256: createHash('sha256').update(triangle).digest('hex'),
            positionCount: 18,
            indexCount: 3,
          },
        ],
      });
      await expect(
        definition.createGeometry({ entryPath: 'main.cs', parameters: {}, options: {} }, cacheRuntime, value),
      ).resolves.toMatchObject({ geometry: { format: 'gltf' } });
      expect(record).not.toHaveBeenCalled();
      expect(cacheRuntime.logger.warn).toHaveBeenCalledWith(
        'PicoGK component cache publication failed.',
        expect.objectContaining({ data: expect.any(Error) }),
      );
    },
  );

  it('ignores foreign prepared actions and reports corrupt component publications as best-effort misses', async () => {
    const validMiss = JSON.stringify({
      namespace: 'picogk.component-materialization.v2',
      operation: 'snapshot-geometry',
      arguments: { cacheKey: '1:mesh', kind: 'triangles', positionCount: 9, indexCount: 3 },
    });
    const preparedMetadata = {
      bytes: triangle,
      actionDigest: actionDigest({ value: `sha256:${'c'.repeat(64)}` }),
      contentDigest: contentDigest({ value: `sha256:${'d'.repeat(64)}` }),
    };
    const prepared = [
      { ...preparedMetadata, canonicalAction: '{' },
      {
        ...preparedMetadata,
        canonicalAction: JSON.stringify({
          namespace: 'foreign',
          operation: 'snapshot-geometry',
          arguments: { cacheKey: 'foreign', kind: 'triangles', positionCount: 9, indexCount: 3 },
        }),
      },
      {
        ...preparedMetadata,
        canonicalAction: JSON.stringify({
          namespace: 'picogk.component-materialization.v2',
          operation: 'snapshot-geometry',
          arguments: { cacheKey: 'invalid', kind: 'lines', positionCount: 0, indexCount: 0 },
        }),
      },
      { ...preparedMetadata, canonicalAction: validMiss },
    ];
    const lookup = vi.fn(() => ({ status: 'miss' }) as const);
    const cacheRuntime = {
      ...createMockKernelRuntime(),
      compute: {
        ...runtime.compute,
        openSession: vi.fn(async () => ({
          prepared: () => prepared,
          lookup,
          record: vi.fn(),
          flush: vi.fn(async () => undefined),
        })),
      },
    };
    const value = context();
    value.session.request.mockResolvedValueOnce({
      ...buildResult(),
      computePublications: [
        {
          cacheKey: `mesh:sha256:${'2'.repeat(64)}`,
          kind: 'triangles',
          artifactPath: '/private/corrupt.tau-compute',
          byteLength: triangle.byteLength,
          sha256: '0'.repeat(64),
          positionCount: 9,
          indexCount: 3,
        },
      ],
    });

    await expect(
      definition.createGeometry({ entryPath: 'main.cs', parameters: {}, options: {} }, cacheRuntime, value),
    ).resolves.toMatchObject({ geometry: { format: 'gltf' } });

    expect(lookup).not.toHaveBeenCalled();
    expect(value.session.prehydrateCompute).toHaveBeenCalledWith([]);
    expect(cacheRuntime.logger.warn).toHaveBeenCalledWith(
      'PicoGK component cache publication failed.',
      expect.objectContaining({ data: expect.any(Error) }),
    );
  });

  it.each([
    {
      mode: 'update',
      rejection: new Error('bookmark failed'),
      source: 'viewer-update',
    },
    {
      mode: 'operation',
      rejection: 'bookmark failed',
      source: 'viewer-operation',
    },
  ] as const)('falls back from $mode scene publication failures to terminal geometry', async (testCase) => {
    const scene = {
      requested: true,
      publish: vi.fn(async (_input: unknown): Promise<{ type: 'not-requested' }> => ({ type: 'not-requested' })),
      publishUpdate: vi.fn(async (_input: unknown): Promise<{ type: 'not-requested' }> => ({ type: 'not-requested' })),
      // oxlint-disable-next-line unicorn/no-useless-promise-resolve-reject, prefer-promise-reject-errors -- exercises defensive normalization of a non-Error rejection.
      bookmark: vi.fn(async () => Promise.reject(testCase.rejection)),
      flush: vi.fn(async () => undefined),
    };
    const progressRuntime = { ...createMockKernelRuntime(), scene };
    const value = context();
    value.session.request.mockImplementationOnce(async (request: { events: { onEvent: (event: unknown) => void } }) => {
      request.events.onEvent({
        kind: 'scene',
        mode: testCase.mode,
        operation: 'reset',
        baseSceneGeneration: null,
        sceneGeneration: 1,
        artifact: sceneArtifact(`/private/${testCase.mode}.tau-mesh`),
        removedComponentIds: [],
        presentation: {},
        bookmark: { path: `${testCase.mode}.tga`, sceneGeneration: 1 },
      });
      return buildResult();
    });

    await expect(
      definition.createGeometry({ entryPath: 'main.cs', parameters: {}, options: {} }, progressRuntime, value),
    ).resolves.toMatchObject({ geometry: { format: 'gltf' } });

    expect(scene.bookmark).toHaveBeenCalledWith({
      label: `${testCase.mode}.tga`,
      source: testCase.source,
    });
    expect(progressRuntime.logger.warn).toHaveBeenCalledWith(
      'PicoGK progressive scene publication failed; using the authoritative terminal geometry.',
      { data: testCase.rejection },
    );
  });

  it('falls back from scene flush failure to terminal geometry', async () => {
    const rejection = new Error('scene transport failed');
    const scene = {
      requested: true,
      publish: vi.fn(async (_input: unknown): Promise<{ type: 'not-requested' }> => ({ type: 'not-requested' })),
      publishUpdate: vi.fn(async (_input: unknown): Promise<{ type: 'not-requested' }> => ({ type: 'not-requested' })),
      bookmark: vi.fn(async (_input: unknown): Promise<{ type: 'not-requested' }> => ({ type: 'not-requested' })),
      flush: vi.fn(async () => {
        throw rejection;
      }),
    };
    const progressRuntime = { ...createMockKernelRuntime(), scene };
    const value = context();
    value.session.request.mockResolvedValueOnce(buildResult());

    await expect(
      definition.createGeometry({ entryPath: 'main.cs', parameters: {}, options: {} }, progressRuntime, value),
    ).resolves.toMatchObject({ geometry: { format: 'gltf' } });

    expect(scene.flush).toHaveBeenCalledOnce();
    expect(progressRuntime.logger.warn).toHaveBeenCalledWith(
      'PicoGK progressive scene publication failed; using the authoritative terminal geometry.',
      { data: rejection },
    );
  });

  it('treats compute prehydration failure as a best-effort miss', async () => {
    const value = context();
    value.session.prehydrateCompute.mockRejectedValueOnce(new Error('cache unavailable'));
    value.session.request.mockResolvedValueOnce(buildResult());
    await expect(
      definition.createGeometry({ entryPath: 'main.cs', parameters: {}, options: {} }, runtime, value),
    ).resolves.toMatchObject({ geometry: { format: 'gltf' } });
    expect(value.session.request).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.not.objectContaining({ compute: expect.anything() }) }),
    );
    expect(runtime.logger.warn).toHaveBeenCalledWith(
      'PicoGK component cache preparation failed.',
      expect.objectContaining({ data: expect.any(Error) }),
    );
  });

  it('always removes the mirror when session cleanup fails', async () => {
    const value = context();
    value.session.cleanup.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(definition.cleanup?.(value)).rejects.toThrow('cleanup failed');
    expect(value.mirror.cleanup).toHaveBeenCalled();
  });
});
