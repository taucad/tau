/* oxlint-disable typescript/no-unsafe-assignment -- private kernel context is intentionally erased by the public definition. */
// @vitest-environment node
import { createHash } from 'node:crypto';

import type { AnyKernelDefinition } from '@taucad/runtime/kernel';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createMockKernelRuntime } from '@taucad/runtime-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { picogkKernel } from '#picogk.kernel.js';
import { PicogkWorkerError } from '#picogk-session.js';

const runtime = createMockKernelRuntime();
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

const voxelSizeProperty = 'VoxelSizeMm';
const compilationTimings = { cacheHit: false, sourceRead: 1, parse: 2, analyze: 3, emit: 4 };
const workerTimings = {
  compileCacheHit: true,
  sourceRead: 1,
  parse: 0,
  analyze: 0,
  emit: 0,
  libraryInitialize: 2,
  modelInvoke: 3,
  meshConstruction: 4,
  meshExtraction: 5,
  normalGeneration: 6,
  artifactWrite: 7,
  unload: 8,
};
const buildResult = () => ({
  artifactPath: '/private/model.tau-mesh',
  byteLength: triangle.byteLength,
  sha256: createHash('sha256').update(triangle).digest('hex'),
  components: [
    {
      name: 'Part',
      color: '#112233ff',
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

const context = () => ({
  mirror: { sync: vi.fn().mockResolvedValue(['helper.cs', 'main.cs', 'asset.txt']), cleanup: vi.fn() },
  session: { request: vi.fn(), readArtifact: vi.fn().mockResolvedValue(triangle), recycle: vi.fn(), cleanup: vi.fn() },
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

  it('owns C#, mirrors whole-project dependencies, and preserves issue provenance', async () => {
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
      defaultParameters: { [voxelSizeProperty]: 1 },
      jsonSchema: { type: 'object' },
      timings: compilationTimings,
    });
    await expect(definition.getParameters({ entryPath: 'main.cs' }, runtime, value)).resolves.toMatchObject({
      success: true,
      data: { defaultParameters: { [voxelSizeProperty]: 1 } },
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

  it('always removes the mirror when session cleanup fails', async () => {
    const value = context();
    value.session.cleanup.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(definition.cleanup?.(value)).rejects.toThrow('cleanup failed');
    expect(value.mirror.cleanup).toHaveBeenCalled();
  });
});
