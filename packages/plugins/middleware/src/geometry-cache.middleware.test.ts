import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decode as msgpackDecode, encode as msgpackEncode } from '@msgpack/msgpack';
import { digestContent } from '@taucad/cache-core';
import type { ContentDigest } from '@taucad/cache-core';
import { z } from 'zod';
import { nativeBuildInputSymbol } from '@taucad/runtime/middleware';
import type { NativeBuildInputCarrier } from '@taucad/runtime/middleware';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { Artifact, EvaluateResult, RenderResult, KernelExportResult } from '@taucad/runtime/types';
import { createErrorResult, createMockInput, createMockRuntime } from '@taucad/runtime-testing';
import { geometryCache } from '#geometry-cache.middleware.js';

const replayInput = { entryPath: 'main.ts', parameters: { width: 12 }, options: { tolerance: 0.1 } };
const resolveMiddleware = async () => resolveRuntimePluginDefinition('middleware', geometryCache());

const reusableBuild = (
  serializedHandle = new Uint8Array([1, 2, 3]),
): Extract<EvaluateResult, { success: true }> & NativeBuildInputCarrier => ({
  success: true,
  data: { views: ['model'], exports: ['step'] },
  issues: [],
  serializedHandle,
  [nativeBuildInputSymbol]: replayInput,
});

const successfulRender = (data: Artifact): RenderResult => ({ success: true, data, issues: [] });
const successfulExport = (bytes = new Uint8Array([4, 5, 6])): KernelExportResult => ({
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
    expect(middleware).toMatchObject({ name: 'GeometryCache', version: '4.0.0' });
  });

  it('shares build/display binary slots while preserving reference-shaped ordinary snapshot data', async () => {
    const runtime = createMockRuntime();
    if (runtime.compute.status !== 'on') {
      throw new Error('Expected compute capability');
    }
    const evaluate = vi.spyOn(runtime.compute, 'evaluate');
    const bytes = new Uint8Array(8192).fill(7);
    const snapshot = {
      glb: bytes,
      ordinary: { digest: `sha256:${'a'.repeat(64)}`, byteLength: 42 },
      images: [bytes],
      name: 'Bolt',
    };
    const built: EvaluateResult & NativeBuildInputCarrier = { ...reusableBuild(), serializedHandle: snapshot };
    await middleware.wrapEvaluate!(createMockInput(), async () => built, runtime);
    await middleware.wrapRender!(
      { view: 'model', mimeType: 'model/gltf-binary', options: {} },
      async () => successfulRender({ mimeType: 'model/gltf-binary', content: bytes }),
      runtime,
    );
    const { codec: build } = evaluate.mock.calls[0]![0];
    const { codec: mesh } = evaluate.mock.calls[1]![0];
    const { signal } = new AbortController();
    const encodedBuild = await build.encode({ value: built, signal });
    const encodedMesh = await mesh.encode({
      value: successfulRender({ mimeType: 'model/gltf-binary', content: bytes }),
      signal,
    });
    if (encodedBuild instanceof Uint8Array || encodedMesh instanceof Uint8Array) {
      throw new TypeError('Expected shared content parts');
    }
    expect(encodedBuild.content).toHaveLength(1);
    expect(encodedMesh.content).toHaveLength(1);
    expect(encodedBuild.bytes.byteLength + encodedMesh.bytes.byteLength).toBeLessThan(2048);
    const repeated = await build.encode({ value: built, signal });
    if (repeated instanceof Uint8Array) {
      throw new TypeError('Expected shared content parts');
    }
    expect(repeated.bytes).toEqual(encodedBuild.bytes);
    const digest = await digestContent({ bytes });
    const readContent = vi.fn(async ({ digest: requested }: { digest: ContentDigest }) =>
      requested === digest ? bytes : undefined,
    );
    const restored = await build.decode({ bytes: encodedBuild.bytes, signal, readContent });
    expect(restored).toMatchObject({ serializedHandle: snapshot, [nativeBuildInputSymbol]: replayInput });
    expect(await mesh.decode({ bytes: encodedMesh.bytes, signal, readContent })).toEqual(
      successfulRender({ mimeType: 'model/gltf-binary', content: bytes }),
    );
    expect(readContent).toHaveBeenCalledTimes(2);
    expect(build.version).toBe('4');
    expect(mesh.version).toBe('3');
  });

  it('bounds logical slot bytes before alias copies and resolves repeated leaves once with independent outputs', async () => {
    const runtime = createMockRuntime();
    if (runtime.compute.status !== 'on') {
      throw new Error('Expected compute capability');
    }
    const evaluate = vi.spyOn(runtime.compute, 'evaluate');
    await middleware.wrapEvaluate!(createMockInput(), async () => reusableBuild(), runtime);
    const { codec } = evaluate.mock.calls[0]![0];
    const { signal } = new AbortController();
    const original = Uint8Array;
    let cloneCalls = 0;
    let copiedBytes = 0;
    const counted = new Proxy(original, {
      construct(target, args) {
        const source: unknown = args[0];
        if (source instanceof original) {
          cloneCalls++;
          copiedBytes += source.byteLength;
        }
        const result: unknown = Reflect.construct(target, args);
        if (!(result instanceof original)) {
          throw new TypeError('Expected byte array');
        }
        return result;
      },
    });
    // oxlint-disable-next-line new-cap -- Retain the native constructor while instrumenting the global.
    const bytes = new original(16 * 1024);
    // oxlint-disable-next-line new-cap -- Retain the native constructor while instrumenting the global.
    const aliases = Array.from({ length: 4095 }, () => new original(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    const hash = vi.spyOn(globalThis.crypto.subtle, 'digest');
    vi.stubGlobal('Uint8Array', counted);
    try {
      const encoded = await codec.encode({ value: { ...reusableBuild(), serializedHandle: aliases }, signal });
      if (encoded instanceof original) {
        throw new TypeError('Expected shared content');
      }
      expect(encoded.content).toHaveLength(1);
      expect(hash).toHaveBeenCalledOnce();
      expect(cloneCalls).toBe(2); // Codec capture and existing digestContent's defensive hash input copy.
      expect(copiedBytes).toBe(2 * bytes.byteLength);
      // oxlint-disable-next-line new-cap -- Retain the native constructor while instrumenting the global.
      const large = new original(32 * 1024 * 1024);
      hash.mockClear();
      cloneCalls = 0;
      copiedBytes = 0;
      await expect(
        codec.encode({ value: { ...reusableBuild(), serializedHandle: [large, large, large] }, signal }),
      ).rejects.toThrow('ownership budget');
      expect(hash).toHaveBeenCalledOnce();
      expect(cloneCalls).toBe(2);
      expect(copiedBytes).toBe(64 * 1024 * 1024);
    } finally {
      vi.unstubAllGlobals();
      hash.mockRestore();
    }
    // oxlint-disable-next-line new-cap -- Retain the native constructor while instrumenting the global.
    const small = new original([1, 2, 3]);
    const encoded = await codec.encode({ value: { ...reusableBuild(), serializedHandle: [small, small] }, signal });
    if (encoded instanceof original) {
      throw new TypeError('Expected shared content');
    }
    const readContent = vi.fn(async () => small);
    const hashDecode = vi.spyOn(globalThis.crypto.subtle, 'digest');
    cloneCalls = 0;
    copiedBytes = 0;
    vi.stubGlobal('Uint8Array', counted);
    try {
      const decoded = await codec.decode({ bytes: encoded.bytes, signal, readContent });
      const restored = z.object({ serializedHandle: z.array(z.instanceof(original)) }).parse(decoded);
      expect(readContent).toHaveBeenCalledOnce();
      expect(hashDecode).toHaveBeenCalledOnce();
      expect(cloneCalls).toBe(4); // One validation capture, one hash input and two independent result slots.
      expect(copiedBytes).toBe(4 * small.byteLength);
      restored.serializedHandle[0]![0] = 99;
      expect([...restored.serializedHandle[1]!]).toEqual([1, 2, 3]);
      expect([...small]).toEqual([1, 2, 3]);
    } finally {
      vi.unstubAllGlobals();
      hashDecode.mockRestore();
    }
  });

  it('rejects malformed inventories, unsupported schemas and missing or corrupt leaf bytes', async () => {
    const runtime = createMockRuntime();
    if (runtime.compute.status !== 'on') {
      throw new Error('Expected compute capability');
    }
    const evaluate = vi.spyOn(runtime.compute, 'evaluate');
    const built = reusableBuild();
    await middleware.wrapEvaluate!(createMockInput(), async () => built, runtime);
    const { codec } = evaluate.mock.calls[0]![0];
    const { signal } = new AbortController();
    const encoded = await codec.encode({ value: built, signal });
    if (encoded instanceof Uint8Array) {
      throw new TypeError('Expected shared content');
    }
    const metadata = z.record(z.string(), z.unknown()).parse(msgpackDecode(encoded.bytes));
    const persistedResult = z.record(z.string(), z.unknown()).parse(metadata['result']);
    let nested: unknown = 'nonbinary';
    for (let depth = 0; depth < 130; depth++) {
      nested = [nested];
    }
    await expect(
      codec.decode({
        bytes: msgpackEncode(
          { ...metadata, result: { ...persistedResult, serializedHandle: nested }, binaryPaths: [] },
          { maxDepth: 256 },
        ),
        signal,
      }),
    ).rejects.toThrow();
    const valid = vi.fn(async () => new Uint8Array([1, 2, 3]));
    for (const delta of [
      { schemaVersion: 1 },
      { binaryPaths: [[], []] },
      { binaryPaths: [['missing']] },
      { binaryPaths: [[0]] },
      { binaryPaths: [[]], unexpected: true },
      { binaryPaths: Array.from({ length: 4097 }, () => []) },
      { binaryPaths: [Array.from({ length: 129 }, () => 'nested')] },
      { result: { ...persistedResult, serializedHandle: { digest: 'invalid', byteLength: 3 } } },
      { result: { ...persistedResult, serializedHandle: { digest: `sha256:${'a'.repeat(64)}`, byteLength: -1 } } },
      { result: { ...persistedResult, serializedHandle: new Uint8Array([1, 2, 3]) }, binaryPaths: [] },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- Each corrupt entry must independently fail hydration.
      await expect(
        codec.decode({ bytes: msgpackEncode({ ...metadata, ...delta }), signal, readContent: valid }),
      ).rejects.toThrow();
    }
    await expect(codec.decode({ bytes: encoded.bytes, signal })).rejects.toThrow('Missing or corrupt');
    await expect(codec.decode({ bytes: encoded.bytes, signal, readContent: async () => undefined })).rejects.toThrow(
      'Missing or corrupt',
    );
    await expect(
      codec.decode({ bytes: encoded.bytes, signal, readContent: async () => new Uint8Array([1, 2]) }),
    ).rejects.toThrow('Missing or corrupt');
    await expect(
      codec.decode({ bytes: encoded.bytes, signal, readContent: async () => new Uint8Array([9, 9, 9]) }),
    ).rejects.toThrow('Missing or corrupt');
    const controller = new AbortController();
    const readContent = vi.fn(async () => {
      controller.abort();
      return new Uint8Array([1, 2, 3]);
    });
    await expect(codec.decode({ bytes: encoded.bytes, signal: controller.signal, readContent })).rejects.toThrow();
    expect(readContent).toHaveBeenCalledOnce();
    controller.abort();
    await expect(codec.encode({ value: built, signal: controller.signal })).rejects.toThrow();
    await expect(
      codec.encode({
        value: { ...built, serializedHandle: Array.from({ length: 4097 }, () => new Uint8Array([1])) },
        signal,
      }),
    ).rejects.toThrow('inventory exceeds');
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

  it('serializes a deferred snapshot once for publication and never again on the warm hit', async () => {
    const snapshot = vi.fn(() => ({ glb: new Uint8Array([1, 2, 3]), authored: 'Assembly' }));
    const result: EvaluateResult & NativeBuildInputCarrier = {
      success: true,
      data: { views: ['model'] },
      issues: [],
      serializeHandleSnapshot: snapshot,
      [nativeBuildInputSymbol]: replayInput,
    };
    const runtime = createMockRuntime();
    const handler = vi.fn(async () => result);
    await middleware.wrapEvaluate!(createMockInput(), handler, runtime);
    const warm = await middleware.wrapEvaluate!(createMockInput(), handler, runtime);
    expect(handler).toHaveBeenCalledOnce();
    expect(snapshot).toHaveBeenCalledOnce();
    expect(warm).toMatchObject({ serializedHandle: { glb: new Uint8Array([1, 2, 3]), authored: 'Assembly' } });
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
    const end = vi.fn<(attributes?: Record<string, string | number | boolean>) => void>();
    runtime.tracer.startSpan.mockReturnValue({ end });
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
    const computed = end.mock.calls[0]?.[0];
    if (!computed) {
      throw new Error('Computed mesh span did not record its outcome');
    }
    expect(computed).toEqual({
      source: 'computed',
      publicationStatus: 'stored',
      actionDigest: computed['actionDigest'],
      contentDigest: computed['contentDigest'],
    });
    expect(computed['actionDigest']).toMatch(/^sha256:[\da-f]{64}$/);
    expect(computed['contentDigest']).toMatch(/^sha256:[\da-f]{64}$/);
    expect(end.mock.calls[1]?.[0]).toEqual({
      source: 'cache',
      actionDigest: computed['actionDigest'],
      contentDigest: computed['contentDigest'],
    });
    const changedRuntime = { ...runtime, dependencyHash: 'b'.repeat(64) };
    const changedHandler = vi.fn(async () =>
      successfulRender({ mimeType: 'model/gltf-binary', content: new Uint8Array([10]) }),
    );
    await middleware.wrapRender!(input, changedHandler, changedRuntime);
    expect(changedHandler).toHaveBeenCalledOnce();
    const changed = end.mock.calls[2]?.[0];
    if (!changed) {
      throw new Error('Changed mesh span did not record its outcome');
    }
    expect(changed).toEqual({
      source: 'computed',
      publicationStatus: 'stored',
      actionDigest: changed['actionDigest'],
      contentDigest: changed['contentDigest'],
    });
    expect(changed['actionDigest']).toMatch(/^sha256:[\da-f]{64}$/);
    expect(changed['contentDigest']).toMatch(/^sha256:[\da-f]{64}$/);
    expect(changed['actionDigest']).not.toBe(computed['actionDigest']);
    expect(changed['contentDigest']).not.toBe(computed['contentDigest']);
    expect(end).toHaveBeenCalledTimes(3);
  });

  it('keeps nonbinary string display content inline and exactly reusable', async () => {
    const runtime = createMockRuntime();
    const artifact = {
      mimeType: 'model/gltf+json',
      content: '{"asset":{"version":"2.0"},"extras":{"name":"Authored"}}',
    };
    const handler = vi.fn(async () => successfulRender(artifact));
    const input = { view: 'model', mimeType: 'model/gltf+json', options: {} };
    await middleware.wrapRender!(input, handler, runtime);
    const warm = await middleware.wrapRender!(input, handler, runtime);
    expect(handler).toHaveBeenCalledOnce();
    expect(warm).toEqual(successfulRender(artifact));
  });

  it.each([['failed', createErrorResult()]])('does not publish a %s mesh result', async (_name, result) => {
    const runtime = createMockRuntime();
    const end = vi.fn<(attributes?: Record<string, string | number | boolean>) => void>();
    runtime.tracer.startSpan.mockReturnValue({ end });
    const handler = vi.fn(async () => result);

    await middleware.wrapRender!({ view: 'model', mimeType: 'model/gltf-binary', options: {} }, handler, runtime);
    await middleware.wrapRender!({ view: 'model', mimeType: 'model/gltf-binary', options: {} }, handler, runtime);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(end).toHaveBeenCalledTimes(2);
    for (const [attributes] of end.mock.calls) {
      expect(attributes?.['actionDigest']).toMatch(/^sha256:[\da-f]{64}$/);
      expect(attributes).toEqual({
        source: 'computed',
        actionDigest: attributes?.['actionDigest'],
        publicationStatus: 'skipped',
        publicationReason: 'encode-failed',
      });
    }
  });

  it('reuses exact export files with byte ownership', async () => {
    const runtime = createMockRuntime();
    const handler = vi.fn(async () => successfulExport());
    const first = await middleware.wrapExport!(
      { exportId: 'step', extension: 'step', mimeType: 'application/step', options: {} },
      handler,
      runtime,
    );
    if (first.success) {
      first.data[0].bytes[0] = 99;
    }
    const second = await middleware.wrapExport!(
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
    await middleware.wrapExport!(
      { exportId: 'step', extension: 'step', mimeType: 'application/step', options: {} },
      handler,
      runtime,
    );
    await middleware.wrapExport!(
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
    const end = vi.fn<(attributes?: Record<string, string | number | boolean>) => void>();
    runtime.tracer.startSpan.mockReturnValue({ end });
    const handler = vi.fn(async () => reusableBuild());

    await expect(middleware.wrapEvaluate!(createMockInput(), handler, runtime)).rejects.toThrow(
      'middleware dependency hash',
    );
    expect(handler).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledExactlyOnceWith(undefined);
  });
});
