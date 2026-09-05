import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nativeBuildInputSymbol } from '@taucad/runtime/middleware';
import type { ExportGeometryHandler, MeshGeometryHandler, NativeBuildInputCarrier } from '@taucad/runtime/middleware';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type {
  CreateGeometryResult,
  ExportGeometryResult,
  GeometryResponse,
  MeshGeometryResult,
} from '@taucad/runtime/types';
import {
  createErrorResult,
  createGltfSuccessResult,
  createMockInput,
  createMockRuntime,
} from '@taucad/runtime-testing';
import { geometryCache } from '#geometry-cache.middleware.js';

const replayInput = { entryPath: 'main.ts', parameters: { width: 12 }, options: { tolerance: 0.1 } };
const resolveMiddleware = async () => resolveRuntimePluginDefinition('middleware', geometryCache());

const reusableBuild = (content = new Uint8Array([1, 2, 3])): CreateGeometryResult & NativeBuildInputCarrier => ({
  ...createGltfSuccessResult(content),
  [nativeBuildInputSymbol]: replayInput,
});

const successfulMesh = (data: GeometryResponse): MeshGeometryResult => ({ success: true, data, issues: [] });
const successfulExport = (bytes = new Uint8Array([4, 5, 6])): ExportGeometryResult => ({
  success: true,
  data: [{ name: 'model.step', mimeType: 'application/step', bytes }],
  issues: [],
});
const liveBuild: CreateGeometryResult & NativeBuildInputCarrier = {
  success: true,
  data: { format: 'webrtc', stream: new EventTarget() },
  issues: [],
  [nativeBuildInputSymbol]: replayInput,
};
const emptyBuild: CreateGeometryResult & NativeBuildInputCarrier = {
  success: true,
  data: undefined,
  issues: [],
  [nativeBuildInputSymbol]: replayInput,
};
const emptyExport: ExportGeometryResult = { success: true, data: [], issues: [] };

describe('geometryCache', () => {
  let middleware: Awaited<ReturnType<typeof resolveMiddleware>>;

  beforeEach(async () => {
    middleware = await resolveMiddleware();
  });

  it('declares the CAS-backed middleware identity', () => {
    expect(middleware).toMatchObject({ name: 'GeometryCache', version: '2.0.0' });
  });

  it('reuses an exact build and preserves owned bytes plus replay input', async () => {
    const runtime = createMockRuntime();
    const input = createMockInput({ entryPath: 'main.ts', parameters: replayInput.parameters });
    const handler = vi.fn(async () => reusableBuild());

    const first = await middleware.wrapCreateGeometry!(input, handler, runtime);
    if (first.success && first.data?.format === 'gltf') {
      first.data.content[0] = 99;
    }
    const second = await middleware.wrapCreateGeometry!(input, handler, runtime);

    expect(handler).toHaveBeenCalledOnce();
    expect(second).toMatchObject({ success: true, data: { format: 'gltf' } });
    if (second.success && second.data?.format === 'gltf') {
      expect([...second.data.content]).toEqual([1, 2, 3]);
    }
    expect((second as CreateGeometryResult & NativeBuildInputCarrier)[nativeBuildInputSymbol]).toEqual(replayInput);
    expect(runtime.logger.debug).toHaveBeenNthCalledWith(1, expect.stringContaining('computed'));
    expect(runtime.logger.debug).toHaveBeenNthCalledWith(2, expect.stringContaining('cache'));
    expect(runtime.tracer.startSpan).toHaveBeenCalledWith('cache.geometry.build.evaluate');
  });

  it('reuses a serialized native handle when display meshing is deferred', async () => {
    const runtime = createMockRuntime();
    const result: CreateGeometryResult & NativeBuildInputCarrier = {
      success: true,
      data: undefined,
      issues: [],
      serializedNativeHandle: { kind: 'brep', id: 7 },
      [nativeBuildInputSymbol]: replayInput,
    };
    const handler = vi.fn(async () => result);

    await middleware.wrapCreateGeometry!(createMockInput(), handler, runtime);
    const cached = await middleware.wrapCreateGeometry!(createMockInput(), handler, runtime);

    expect(handler).toHaveBeenCalledOnce();
    expect(cached).toMatchObject({ success: true, data: undefined, serializedNativeHandle: { id: 7 } });
  });

  it('executes demanded scene output even when the terminal build is cached, without disabling atomic reuse', async () => {
    const runtime = createMockRuntime();
    const liveRuntime = { ...runtime, progressiveSceneRequested: true };
    const input = createMockInput();
    const handler = vi.fn(async () => reusableBuild());

    await middleware.wrapCreateGeometry!(input, handler, runtime);
    await middleware.wrapCreateGeometry!(input, handler, liveRuntime);
    await middleware.wrapCreateGeometry!(input, handler, liveRuntime);
    await middleware.wrapCreateGeometry!(input, handler, runtime);

    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('never masks a live execution failure with an older cached terminal success', async () => {
    const runtime = createMockRuntime();
    await middleware.wrapCreateGeometry!(createMockInput(), async () => reusableBuild(), runtime);
    const failure = createErrorResult();
    const result = await middleware.wrapCreateGeometry!(createMockInput(), async () => failure, {
      ...runtime,
      progressiveSceneRequested: true,
    });

    expect(result).toBe(failure);
  });

  it.each([
    ['failed', createErrorResult()],
    ['live WebRTC', liveBuild],
    ['missing replay input', createGltfSuccessResult(new Uint8Array([1]))],
    ['empty', emptyBuild],
  ])('does not publish a %s build result', async (_name, result) => {
    const runtime = createMockRuntime();
    const handler = vi.fn(async () => result);

    await middleware.wrapCreateGeometry!(createMockInput(), handler, runtime);
    await middleware.wrapCreateGeometry!(createMockInput(), handler, runtime);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('reuses an exact display mesh with byte ownership', async () => {
    const runtime = createMockRuntime();
    const handler: MeshGeometryHandler = vi.fn(async () =>
      successfulMesh({ format: 'gltf', content: new Uint8Array([7, 8, 9]) }),
    );
    const input = { options: { tolerance: 0.1 } };

    const first = await middleware.wrapMeshGeometry!(input, handler, runtime);
    if (first.success && first.data.format === 'gltf') {
      first.data.content[0] = 99;
    }
    const second = await middleware.wrapMeshGeometry!(input, handler, runtime);

    expect(handler).toHaveBeenCalledOnce();
    if (second.success && second.data.format === 'gltf') {
      expect([...second.data.content]).toEqual([7, 8, 9]);
    }
    expect(runtime.tracer.startSpan).toHaveBeenCalledWith('cache.geometry.mesh.evaluate');
  });

  it.each([
    ['failed', createErrorResult() as MeshGeometryResult],
    ['live WebRTC', successfulMesh({ format: 'webrtc', stream: new EventTarget() })],
  ])('does not publish a %s mesh result', async (_name, result) => {
    const runtime = createMockRuntime();
    const handler: MeshGeometryHandler = vi.fn(async () => result);

    await middleware.wrapMeshGeometry!({ options: {} }, handler, runtime);
    await middleware.wrapMeshGeometry!({ options: {} }, handler, runtime);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('reuses exact export files with byte ownership', async () => {
    const runtime = createMockRuntime();
    const handler: ExportGeometryHandler = vi.fn(async () => successfulExport());
    const first = await middleware.wrapExportGeometry!({ format: 'step', options: {} }, handler, runtime);
    if (first.success) {
      first.data[0]!.bytes[0] = 99;
    }
    const second = await middleware.wrapExportGeometry!({ format: 'step', options: {} }, handler, runtime);

    expect(handler).toHaveBeenCalledOnce();
    expect(second.success && [...second.data[0]!.bytes]).toEqual([4, 5, 6]);
    expect(runtime.tracer.startSpan).toHaveBeenCalledWith('cache.geometry.export.evaluate');
  });

  it.each([
    ['failed', createErrorResult() as ExportGeometryResult],
    ['empty', emptyExport],
  ])('does not publish a %s export result', async (_name, result) => {
    const runtime = createMockRuntime();
    const handler: ExportGeometryHandler = vi.fn(async () => result);
    await middleware.wrapExportGeometry!({ format: 'step', options: {} }, handler, runtime);
    await middleware.wrapExportGeometry!({ format: 'step', options: {} }, handler, runtime);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('misses when the dependency identity changes', async () => {
    const runtime = createMockRuntime();
    const handler = vi.fn(async () => reusableBuild());

    await middleware.wrapCreateGeometry!(createMockInput(), handler, runtime);
    runtime.dependencyHash = 'b'.repeat(64);
    await middleware.wrapCreateGeometry!(createMockInput(), handler, runtime);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('rejects a malformed dependency identity before invoking the kernel', async () => {
    const runtime = createMockRuntime({ dependencyHash: 'not-a-digest' });
    const handler = vi.fn(async () => reusableBuild());

    await expect(middleware.wrapCreateGeometry!(createMockInput(), handler, runtime)).rejects.toThrow(
      'middleware dependency hash',
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
