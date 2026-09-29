import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createMockKernelRuntime, expectKernelProjectionOrder, validateGlbData } from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { defaultPostProcess } from 'libassimp';
import type { AssimpFile, ConvertOptions, ConvertResult } from 'libassimp';

import { assimpKernel } from '#assimp.kernel.js';

type ConvertHandler = (files: readonly AssimpFile[], options: ConvertOptions<'glb'>) => Promise<ConvertResult>;

const definition = await resolveRuntimePluginDefinition('kernel', assimpKernel());
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
// This focused fixture supplies only the Assimp method exercised by these hook tests.
const createContext = (handler: ConvertHandler) =>
  ({ assimp: { convert: vi.fn(handler) } }) as unknown as Parameters<typeof definition.evaluate>[2] & {
    assimp: { convert: ReturnType<typeof vi.fn<ConvertHandler>> };
  };
const createCachedRuntime = (cache: ReadonlyMap<string, Uint8Array<ArrayBuffer> | string>, signal?: AbortSignal) => ({
  ...createMockKernelRuntime({ signal }),
  fileContentCache: cache,
});

beforeAll(async () => {
  context = await definition.initialize({}, runtime);
});

afterAll(async () => {
  await definition.onDispose?.(context);
});

describe('assimpKernel', () => {
  it('should inventory dependencies and return an empty parameter schema', async () => {
    const localRuntime = createMockKernelRuntime();
    localRuntime.filesystem.mocks.readdir.mockResolvedValue(['texture.png', 'main.obj']);
    localRuntime.filesystem.mocks.stat.mockResolvedValue({ type: 'file', size: 4, mtimeMs: 0 });
    localRuntime.filesystem.mocks.readFile.mockResolvedValue(encode('fixture'));

    await expect(definition.resolve({ entryPath: 'models/main.obj' }, localRuntime, context)).resolves.toEqual({
      resolved: ['models/main.obj', 'models/texture.png'],
      unresolved: [],
    });
    await expect(definition.describe({ entryPath: 'models/main.obj' }, localRuntime, context)).resolves.toMatchObject({
      success: true,
      data: {
        parameters: {
          defaults: {},
          schema: {
            $id: 'urn:taucad:assimp:parameters',
            name: 'AssimpParameters',
            type: 'object',
          },
        },
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

    const result = await definition.evaluate(
      { entryPath: 'models/main.obj', parameters: {}, options: {} },
      localRuntime,
      localContext,
    );

    expect(localContext.assimp.convert).toHaveBeenCalledOnce();
    expect(localRuntime.filesystem.mocks.readFile).not.toHaveBeenCalled();
    expect(localRuntime.filesystem.mocks.exists).not.toHaveBeenCalled();
    expect(localRuntime.filesystem.mocks.readdir).not.toHaveBeenCalled();
    expect(localRuntime.filesystem.mocks.stat).not.toHaveBeenCalled();
    expect(result.handle).toEqual(convertedGlb);
    expect(
      await definition.render!({ handle: result.handle, view: 'model', options: {} }, localRuntime, localContext),
    ).toEqual({ content: convertedGlb });
    const freshSnapshot = definition.serializeHandle!({ handle: result.handle }, localRuntime, localContext);
    const render = async (handle: typeof result.handle) => {
      const projected = await definition.render!({ handle, view: 'model', options: {} }, localRuntime, localContext);
      return projected.content;
    };
    const write = async (
      handle: typeof result.handle,
      coordinateSystem: 'y-up' | 'z-up',
      length: 'meter' | 'millimeter',
    ) => {
      const projected = await definition.write!(
        { exportId: 'glb', handle, options: { coordinateSystem, unit: { length } } },
        localRuntime,
        localContext,
      );
      return projected.files[0].bytes;
    };
    const ordered = await expectKernelProjectionOrder({
      renderA: async () => render(result.handle),
      renderB: async () => write(result.handle, 'y-up', 'meter'),
      write: async () => write(result.handle, 'z-up', 'millimeter'),
      freshB: async () => {
        const fresh = definition.deserializeHandle!({ serialized: freshSnapshot }, localRuntime, localContext);
        return write(fresh, 'y-up', 'meter');
      },
    });
    expect(ordered.first).toEqual(convertedGlb);
  });

  it('reads an uncached entry exactly once without inventory probes', async () => {
    const entry = encode('provider entry');
    const localRuntime = createCachedRuntime(new Map());
    localRuntime.filesystem.mocks.readFile.mockResolvedValue(entry);
    const localContext = createContext(async (files) => {
      expect(files).toEqual([{ name: 'main.obj', bytes: entry }]);
      return { files: [{ name: 'converted.glb', bytes: convertedGlb }] };
    });

    await definition.evaluate(
      { entryPath: 'models/main.obj', parameters: {}, options: {} },
      localRuntime,
      localContext,
    );

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

    await definition.evaluate(
      { entryPath: 'models/main.obj', parameters: {}, options: {} },
      localRuntime,
      localContext,
    );

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

    await definition.evaluate({ entryPath: 'main.obj', parameters: {}, options: {} }, localRuntime, localContext);

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
      definition.evaluate({ entryPath: 'main.obj', parameters: {}, options: {} }, localRuntime, localContext),
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

    await definition.evaluate(
      { entryPath: 'models/main.obj', parameters: {}, options: {} },
      localRuntime,
      localContext,
    );

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
      definition.evaluate({ entryPath: 'main.obj', parameters: {}, options: {} }, localRuntime, localContext),
    ).rejects.toBe(reason);
  });

  it('rejects an already-aborted operation before reading an uncached entry', async () => {
    const controller = new AbortController();
    const reason = new Error('render superseded before staging');
    controller.abort(reason);
    const localRuntime = createCachedRuntime(new Map(), controller.signal);
    const localContext = createContext(async () => ({ files: [{ name: 'converted.glb', bytes: convertedGlb }] }));

    await expect(
      definition.evaluate({ entryPath: 'main.obj', parameters: {}, options: {} }, localRuntime, localContext),
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
      definition.evaluate({ entryPath: 'main.obj', parameters: {}, options: {} }, localRuntime, localContext),
    ).rejects.toThrow('Failed to import obj file: libassimp returned no GLB output');
  });

  it('should export GLB bytes and reject an empty native handle', async () => {
    await expect(
      definition.write!(
        {
          exportId: 'glb',
          handle: convertedGlb,
          options: { coordinateSystem: 'y-up', unit: { length: 'meter' } },
        },
        runtime,
        context,
      ),
    ).resolves.toEqual({ files: [{ name: 'model.glb', bytes: convertedGlb, mimeType: 'model/gltf-binary' }] });
    await expect(
      definition.write!(
        {
          exportId: 'glb',
          handle: new Uint8Array(),
          options: { coordinateSystem: 'y-up', unit: { length: 'meter' } },
        },
        runtime,
        context,
      ),
    ).rejects.toThrow('No geometry available for export.');
  });

  it('should copy native-handle bytes across serialization boundaries', () => {
    const { serializeHandle, deserializeHandle } = definition;
    expect(serializeHandle).toBeDefined();
    expect(deserializeHandle).toBeDefined();
    if (!serializeHandle) {
      return;
    }

    const serialized = serializeHandle({ handle: convertedGlb }, runtime, context);
    const restored = deserializeHandle({ serialized }, runtime, context);

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

      const result = await definition.evaluate({ entryPath: name, parameters: {}, options: {} }, runtime, context);
      const artifact = await definition.render!(
        { handle: result.handle, view: 'model', options: {} },
        runtime,
        context,
      );
      validateGlbData(artifact.content as Uint8Array<ArrayBuffer>);
    },
  );
});
