import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nativeBuildInputSymbol } from '@taucad/runtime/middleware';
import type { NativeBuildInputCarrier } from '@taucad/runtime/middleware';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { Artifact, EvaluateResult, RenderResult, WriteResult } from '@taucad/runtime/types';
import { createErrorResult, createMockInput, createMockRuntime } from '@taucad/runtime-testing';
import { geometryCache } from '#geometry-cache.middleware.js';

const replayInput = { entryPath: 'main.ts', parameters: { width: 12 }, options: { tolerance: 0.1 } };
const resolveMiddleware = async () => resolveRuntimePluginDefinition('middleware', geometryCache());

const reusableBuild = (serializedHandle = new Uint8Array([1, 2, 3])): EvaluateResult & NativeBuildInputCarrier => ({
  success: true,
  data: { views: ['model'], exports: ['step'] },
  issues: [],
  serializedHandle,
  [nativeBuildInputSymbol]: replayInput,
});

const successfulRender = (data: Artifact): RenderResult => ({ success: true, data, issues: [] });
const successfulExport = (bytes = new Uint8Array([4, 5, 6])): WriteResult => ({
  success: true,
  data: [{ name: 'model.step', mimeType: 'application/step', bytes }],
  issues: [],
});
const emptyBuild: EvaluateResult & NativeBuildInputCarrier = {
  success: true,
  data: { views: [] },
  issues: [],
  [nativeBuildInputSymbol]: replayInput,
};

describe('geometryCache', () => {
  let middleware: Awaited<ReturnType<typeof resolveMiddleware>>;

  beforeEach(async () => {
    middleware = await resolveMiddleware();
  });

  it('declares the CAS-backed middleware identity', () => {
    expect(middleware).toMatchObject({ name: 'GeometryCache', version: '3.0.0' });
  });

  it('reuses an exact build and preserves owned bytes plus replay input', async () => {
    const runtime = createMockRuntime();
    const input = createMockInput({ entryPath: 'main.ts', parameters: replayInput.parameters });
    const handler = vi.fn(async () => reusableBuild());

    const first = await middleware.wrapEvaluate!(input, handler, runtime);
    if (first.success && first.serializedHandle instanceof Uint8Array) {
      first.serializedHandle[0] = 99;
    }
    const second = await middleware.wrapEvaluate!(input, handler, runtime);

    expect(handler).toHaveBeenCalledOnce();
    expect(second).toMatchObject({ success: true, data: { views: ['model'], exports: ['step'] } });
    if (second.success && second.serializedHandle instanceof Uint8Array) {
      expect([...second.serializedHandle]).toEqual([1, 2, 3]);
    }
    expect(second[nativeBuildInputSymbol]).toEqual(replayInput);
    expect(runtime.logger.debug).toHaveBeenNthCalledWith(1, expect.stringContaining('computed'));
    expect(runtime.logger.debug).toHaveBeenNthCalledWith(2, expect.stringContaining('cache'));
    expect(runtime.tracer.startSpan).toHaveBeenCalledWith('cache.geometry.build.evaluate');
  });

  it('reuses a serialized native handle when display meshing is deferred', async () => {
    const runtime = createMockRuntime();
    const result: EvaluateResult & NativeBuildInputCarrier = {
      success: true,
      data: { views: ['model'] },
      issues: [],
      serializedHandle: {
        kind: 'brep',
        id: 7,
        material: undefined,
        nested: { normalTexture: undefined, extras: null },
      },
      [nativeBuildInputSymbol]: replayInput,
    };
    const handler = vi.fn(async () => result);

    await middleware.wrapEvaluate!(createMockInput(), handler, runtime);
    const cached = await middleware.wrapEvaluate!(createMockInput(), handler, runtime);

    expect(handler).toHaveBeenCalledOnce();
    expect(cached).toMatchObject({ success: true, serializedHandle: { id: 7 } });
    if (cached.success) {
      expect(cached.data).toEqual({ views: ['model'] });
      expect(cached.serializedHandle).toEqual({ kind: 'brep', id: 7, nested: { extras: null } });
    }
  });

  const failedBuilds: Array<readonly [string, EvaluateResult]> = [
    ['failed', { success: false, issues: [] }],
    ['missing replay input', { ...reusableBuild(), [nativeBuildInputSymbol]: undefined }],
    ['missing serialized handle', emptyBuild],
  ];
  it.each(failedBuilds)('does not publish a %s build result', async (_name, result) => {
    const runtime = createMockRuntime();
    const handler = vi.fn(async () => result);

    await middleware.wrapEvaluate!(createMockInput(), handler, runtime);
    await middleware.wrapEvaluate!(createMockInput(), handler, runtime);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('reuses an exact display mesh with byte ownership', async () => {
    const runtime = createMockRuntime();
    const handler = vi.fn(async () =>
      successfulRender({ mimeType: 'model/gltf-binary', content: new Uint8Array([7, 8, 9]) }),
    );
    const input = { view: 'model', mimeType: 'model/gltf-binary', options: { tolerance: 0.1 } };

    const first = await middleware.wrapRender!(input, handler, runtime);
    if (first.success && first.data.content instanceof Uint8Array) {
      first.data.content[0] = 99;
    }
    const second = await middleware.wrapRender!(input, handler, runtime);

    expect(handler).toHaveBeenCalledOnce();
    if (second.success && second.data.content instanceof Uint8Array) {
      expect([...second.data.content]).toEqual([7, 8, 9]);
    }
    expect(runtime.tracer.startSpan).toHaveBeenCalledWith('cache.geometry.mesh.evaluate');
  });

  it.each([['failed', createErrorResult()]])('does not publish a %s mesh result', async (_name, result) => {
    const runtime = createMockRuntime();
    const handler = vi.fn(async () => result);

    await middleware.wrapRender!({ view: 'model', mimeType: 'model/gltf-binary', options: {} }, handler, runtime);
    await middleware.wrapRender!({ view: 'model', mimeType: 'model/gltf-binary', options: {} }, handler, runtime);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('reuses exact export files with byte ownership', async () => {
    const runtime = createMockRuntime();
    const handler = vi.fn(async () => successfulExport());
    const first = await middleware.wrapWrite!(
      { exportId: 'step', extension: 'step', mimeType: 'application/step', options: {} },
      handler,
      runtime,
    );
    if (first.success) {
      first.data[0].bytes[0] = 99;
    }
    const second = await middleware.wrapWrite!(
      { exportId: 'step', extension: 'step', mimeType: 'application/step', options: {} },
      handler,
      runtime,
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(second.success && [...second.data[0].bytes]).toEqual([4, 5, 6]);
    expect(runtime.tracer.startSpan).toHaveBeenCalledWith('cache.geometry.export.evaluate');
  });

  it.each([['failed', createErrorResult()]])('does not publish a %s export result', async (_name, result) => {
    const runtime = createMockRuntime();
    const handler = vi.fn(async () => result);
    await middleware.wrapWrite!(
      { exportId: 'step', extension: 'step', mimeType: 'application/step', options: {} },
      handler,
      runtime,
    );
    await middleware.wrapWrite!(
      { exportId: 'step', extension: 'step', mimeType: 'application/step', options: {} },
      handler,
      runtime,
    );

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('calls the handler directly and never evaluates when the compute capability is off', async () => {
    const runtime = { ...createMockRuntime(), compute: { status: 'off' } } as const;
    const built = reusableBuild();
    const handler = vi.fn(async () => built);

    const first = await middleware.wrapEvaluate!(createMockInput(), handler, runtime);
    const second = await middleware.wrapEvaluate!(createMockInput(), handler, runtime);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(first).toBe(built);
    expect(second).toBe(built);
    expect(runtime.tracer.startSpan).not.toHaveBeenCalled();
  });

  it('misses when the dependency identity changes', async () => {
    const runtime = createMockRuntime();
    const handler = vi.fn(async () => reusableBuild());

    await middleware.wrapEvaluate!(createMockInput(), handler, runtime);
    await middleware.wrapEvaluate!(createMockInput(), handler, { ...runtime, dependencyHash: 'b'.repeat(64) });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('rejects a malformed dependency identity before invoking the kernel', async () => {
    const runtime = createMockRuntime({ dependencyHash: 'not-a-digest' });
    const handler = vi.fn(async () => reusableBuild());

    await expect(middleware.wrapEvaluate!(createMockInput(), handler, runtime)).rejects.toThrow(
      'middleware dependency hash',
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
