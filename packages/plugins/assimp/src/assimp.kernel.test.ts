/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- defineKernel intentionally erases private backend context */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createMockKernelRuntime, validateGlbData } from '@taucad/runtime-testing';
import type { AnyKernelDefinition } from '@taucad/runtime/kernel';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { defaultPostProcess } from 'libassimp';
import type { AssimpFile, ConvertOptions, ConvertResult } from 'libassimp';

import { assimpKernel } from '#assimp.kernel.js';

type ConvertHandler = (files: readonly AssimpFile[], options: ConvertOptions<'glb'>) => Promise<ConvertResult>;

const definition = await resolveRuntimePluginDefinition<AnyKernelDefinition>('kernel', assimpKernel());
const runtime = createMockKernelRuntime();
let context!: Awaited<ReturnType<typeof definition.initialize>>;

const encode = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);
const createGlb = (): Uint8Array<ArrayBuffer> => {
  const json = encode('{"asset":{"version":"2.0"}} ');
  const bytes = new Uint8Array(20 + json.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46_54_6c_67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, json.byteLength, true);
  view.setUint32(16, 0x4e_4f_53_4a, true);
  bytes.set(json, 20);
  return bytes;
};
const convertedGlb = createGlb();
const createContext = (handler: ConvertHandler) => ({ assimp: { convert: vi.fn(handler) } });
const createCachedRuntime = (cache: ReadonlyMap<string, Uint8Array<ArrayBuffer> | string>, signal?: AbortSignal) => ({
  ...createMockKernelRuntime({ signal }),
  fileContentCache: cache,
});

beforeAll(async () => {
  context = await definition.initialize({}, runtime);
});

afterAll(async () => {
  await definition.cleanup?.(context);
});

describe('assimpKernel', () => {
  it('should inventory dependencies and return an empty parameter schema', async () => {
    const localRuntime = createMockKernelRuntime();
    localRuntime.filesystem.mocks.readdir.mockResolvedValue(['texture.png', 'main.obj']);
    localRuntime.filesystem.mocks.stat.mockResolvedValue({ type: 'file', size: 4, mtimeMs: 0 });
    localRuntime.filesystem.mocks.readFile.mockResolvedValue(encode('fixture'));

    await expect(definition.getDependencies({ entryPath: 'models/main.obj' }, localRuntime, context)).resolves.toEqual({
      resolved: ['models/main.obj', 'models/texture.png'],
      unresolved: [],
    });
    await expect(definition.getParameters({ entryPath: 'models/main.obj' }, localRuntime, context)).resolves.toEqual({
      success: true,
      data: {
        defaultParameters: {},
        jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      issues: [],
    });
  });

  it('uses cached entry and sidecar bytes synchronously without geometry-time provider reads', async () => {
    const localRuntime = createCachedRuntime(
      new Map<string, Uint8Array<ArrayBuffer> | string>([
        ['models/main.obj', 'cached entry λ'],
        ['models/materials/main.mtl', encode('cached material μ')],
      ]),
    );
    const localContext = createContext(async (files, options) => {
      expect(files).toEqual([{ name: 'main.obj', bytes: encode('cached entry λ') }]);
      const sidecar = options.resolve?.('materials/main.mtl');
      expect(sidecar).toBeInstanceOf(Uint8Array);
      expect(sidecar).toEqual(encode('cached material μ'));
      expect(options.signal).toBe(localRuntime.signal);
      expect(options.postProcess).toEqual([...defaultPostProcess, 'embedTextures']);
      return { files: [{ name: 'converted.glb', bytes: convertedGlb }] };
    });

    const result = await definition.createGeometry(
      { entryPath: 'models/main.obj', parameters: {} },
      localRuntime,
      localContext,
    );

    expect(localContext.assimp.convert).toHaveBeenCalledOnce();
    expect(localRuntime.filesystem.mocks.readFile).not.toHaveBeenCalled();
    expect(localRuntime.filesystem.mocks.exists).not.toHaveBeenCalled();
    expect(localRuntime.filesystem.mocks.readdir).not.toHaveBeenCalled();
    expect(localRuntime.filesystem.mocks.stat).not.toHaveBeenCalled();
    expect(result.geometry).toEqual({ format: 'gltf', content: convertedGlb });
    expect(result.nativeHandle).toEqual(convertedGlb);
  });

  it('reads an uncached entry exactly once without inventory probes', async () => {
    const entry = encode('provider entry');
    const localRuntime = createCachedRuntime(new Map());
    localRuntime.filesystem.mocks.readFile.mockResolvedValue(entry);
    const localContext = createContext(async (files) => {
      expect(files).toEqual([{ name: 'main.obj', bytes: entry }]);
      return { files: [{ name: 'converted.glb', bytes: convertedGlb }] };
    });

    await definition.createGeometry({ entryPath: 'models/main.obj', parameters: {} }, localRuntime, localContext);

    expect(localRuntime.filesystem.mocks.readFile).toHaveBeenCalledExactlyOnceWith('models/main.obj', undefined);
    expect(localRuntime.filesystem.mocks.exists).not.toHaveBeenCalled();
    expect(localRuntime.filesystem.mocks.readdir).not.toHaveBeenCalled();
    expect(localRuntime.filesystem.mocks.stat).not.toHaveBeenCalled();
  });

  it('reads an unknown sidecar exactly once without probing or mutating the runtime cache', async () => {
    const cache = new Map<string, Uint8Array<ArrayBuffer> | string>([['models/main.obj', 'cached entry']]);
    const sidecar = encode('provider material');
    const localRuntime = createCachedRuntime(cache);
    localRuntime.filesystem.mocks.readFile.mockResolvedValue(sidecar);
    const localContext = createContext(async (_files, options) => {
      const pending = options.resolve?.('../shared/main.mtl');
      expect(pending).toBeInstanceOf(Promise);
      expect(await pending).toBe(sidecar);
      return { files: [{ name: 'converted.glb', bytes: convertedGlb }] };
    });

    await definition.createGeometry({ entryPath: 'models/main.obj', parameters: {} }, localRuntime, localContext);

    expect(localRuntime.filesystem.mocks.readFile).toHaveBeenCalledExactlyOnceWith('shared/main.mtl', undefined);
    expect(localRuntime.filesystem.mocks.exists).not.toHaveBeenCalled();
    expect(cache.has('shared/main.mtl')).toBe(false);
  });

  it.each(['ENOENT', 'ENOTDIR'] as const)('maps sidecar %s to undefined', async (code) => {
    const localRuntime = createCachedRuntime(new Map([['main.obj', 'cached entry']]));
    localRuntime.filesystem.mocks.readFile.mockRejectedValue(Object.assign(new Error(code), { code }));
    const localContext = createContext(async (_files, options) => {
      await expect(options.resolve?.('missing.mtl')).resolves.toBeUndefined();
      return { files: [{ name: 'converted.glb', bytes: convertedGlb }] };
    });

    await definition.createGeometry({ entryPath: 'main.obj', parameters: {} }, localRuntime, localContext);

    expect(localRuntime.filesystem.mocks.readFile).toHaveBeenCalledExactlyOnceWith('missing.mtl', undefined);
  });

  it('preserves non-missing provider failure identity', async () => {
    const failure = Object.assign(new Error('provider unavailable'), { code: 'EIO' });
    const localRuntime = createCachedRuntime(new Map([['main.obj', 'cached entry']]));
    localRuntime.filesystem.mocks.readFile.mockRejectedValue(failure);
    const localContext = createContext(async (_files, options) => {
      try {
        await options.resolve?.('material.mtl');
      } catch (error) {
        expect(error).toBe(failure);
        throw error;
      }
      throw new Error('Expected the sidecar read to fail.');
    });

    await expect(
      definition.createGeometry({ entryPath: 'main.obj', parameters: {} }, localRuntime, localContext),
    ).rejects.toBe(failure);
    expect(localContext.assimp.convert).toHaveBeenCalledOnce();
    expect(localRuntime.filesystem.mocks.readFile).toHaveBeenCalledExactlyOnceWith('material.mtl', undefined);
  });

  it('confines sidecars to rooted portable paths relative to the entry directory', async () => {
    const localRuntime = createCachedRuntime(new Map([['models/main.obj', 'cached entry']]));
    localRuntime.filesystem.mocks.readFile.mockResolvedValue(encode('shared material'));
    const localContext = createContext(async (_files, options) => {
      for (const name of [
        '/absolute.mtl',
        'https://example.com/material.mtl',
        'file:material.mtl',
        String.raw`materials\main.mtl`,
        'materials/\u0000main.mtl',
        '../../outside.mtl',
      ]) {
        expect((): unknown => options.resolve?.(name)).toThrow();
      }
      await expect(options.resolve?.('../shared/main.mtl')).resolves.toEqual(encode('shared material'));
      return { files: [{ name: 'converted.glb', bytes: convertedGlb }] };
    });

    await definition.createGeometry({ entryPath: 'models/main.obj', parameters: {} }, localRuntime, localContext);

    expect(localRuntime.filesystem.mocks.readFile).toHaveBeenCalledExactlyOnceWith('shared/main.mtl', undefined);
  });

  it('passes the operation signal to libassimp and preserves its abort reason', async () => {
    const controller = new AbortController();
    const reason = new Error('render superseded');
    const localRuntime = createCachedRuntime(new Map([['main.obj', 'cached entry']]), controller.signal);
    const localContext = createContext(async (_files, options) => {
      expect(options.signal).toBe(controller.signal);
      controller.abort(reason);
      options.signal?.throwIfAborted();
      return { files: [{ name: 'converted.glb', bytes: convertedGlb }] };
    });

    await expect(
      definition.createGeometry({ entryPath: 'main.obj', parameters: {} }, localRuntime, localContext),
    ).rejects.toBe(reason);
  });

  it('rejects an already-aborted operation before reading an uncached entry', async () => {
    const controller = new AbortController();
    const reason = new Error('render superseded before staging');
    controller.abort(reason);
    const localRuntime = createCachedRuntime(new Map(), controller.signal);
    const localContext = createContext(async () => ({ files: [{ name: 'converted.glb', bytes: convertedGlb }] }));

    await expect(
      definition.createGeometry({ entryPath: 'main.obj', parameters: {} }, localRuntime, localContext),
    ).rejects.toBe(reason);
    expect(localRuntime.filesystem.mocks.readFile).not.toHaveBeenCalled();
    expect(localContext.assimp.convert).not.toHaveBeenCalled();
  });

  it('should reject imports when libassimp returns no GLB output', async () => {
    const localRuntime = createCachedRuntime(new Map([['main.obj', 'cached entry']]));
    const localContext = createContext(async () => ({
      files: [{ name: 'material.bin', bytes: new Uint8Array([1, 2, 3]) }],
    }));

    await expect(
      definition.createGeometry({ entryPath: 'main.obj', parameters: {} }, localRuntime, localContext),
    ).rejects.toThrow('Failed to import obj file: libassimp returned no GLB output');
  });

  it('should export GLB bytes and reject an empty native handle', async () => {
    await expect(
      definition.exportGeometry(
        {
          format: 'glb',
          nativeHandle: convertedGlb,
          options: { coordinateSystem: 'y-up', unit: { length: 'meter' } },
        },
        runtime,
        context,
      ),
    ).resolves.toEqual({
      success: true,
      data: [{ name: 'model.glb', bytes: convertedGlb, mimeType: 'model/gltf-binary' }],
      issues: [],
    });
    await expect(
      definition.exportGeometry(
        {
          format: 'glb',
          nativeHandle: new Uint8Array(),
          options: { coordinateSystem: 'y-up', unit: { length: 'meter' } },
        },
        runtime,
        context,
      ),
    ).resolves.toEqual({
      success: false,
      issues: [{ message: 'No geometry available for export.', code: 'RUNTIME', type: 'runtime', severity: 'error' }],
    });
  });

  it('should copy native-handle bytes across serialization boundaries', () => {
    const { serializeNativeHandle, deserializeNativeHandle } = definition;
    expect(serializeNativeHandle).toBeDefined();
    expect(deserializeNativeHandle).toBeDefined();
    if (!serializeNativeHandle) {
      return;
    }

    const serialized = serializeNativeHandle({ nativeHandle: convertedGlb }, runtime, context);
    const restored = deserializeNativeHandle({ serializedNativeHandle: serialized }, runtime, context);

    expect(serialized).toEqual(convertedGlb);
    expect(serialized).not.toBe(convertedGlb);
    expect(restored).toEqual(convertedGlb);
    expect(restored).not.toBe(serialized);
  });

  it.each(['cube.obj', 'cube-ascii.stl', 'cube-ascii.ply', 'cube.dae', 'cube-ascii.fbx'])(
    'imports %s through the worker context backend',
    async (name) => {
      const bytes = new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));
      runtime.filesystem.mocks.readdir.mockResolvedValueOnce([name]);
      runtime.filesystem.mocks.stat.mockResolvedValueOnce({ type: 'file', size: bytes.length, mtimeMs: 0 });
      runtime.filesystem.mocks.readFile.mockResolvedValue(bytes);

      const result = await definition.createGeometry({ entryPath: name, parameters: {} }, runtime, context);
      expect(result.geometry?.format).toBe('gltf');
      if (result.geometry?.format === 'gltf') {
        validateGlbData(result.geometry.content);
      }
    },
  );
});
