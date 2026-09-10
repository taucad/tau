/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- AnyKernelDefinition intentionally erases private backend context */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  assertFailure,
  assertSuccess,
  createMockKernelRuntime,
  getBoundingBoxFromInspect,
  getInspectReport,
  glbToDocument,
} from '@taucad/runtime-testing';
import type { AnyKernelDefinition, CreateGeometryOutput } from '@taucad/runtime/kernel';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createExportFile } from '@taucad/runtime/types';
import { createAssimp } from 'libassimp';
import type { Assimp } from 'libassimp';

import { assimpKernel, assimpTranscoder } from '#index.js';

const entryPath = 'models/triangle.gltf';
const sidecarPath = 'models/triangle.bin';
const watchdogMilliseconds = 2000;
const texturedEntryPath = 'textured/cube.obj';
const texturedObject = `mtllib cube.mtl
usemtl tau-blue
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
f 1/1 2/2 3/3
`;
const texturedMaterial = `newmtl tau-blue
map_Kd tau-texture.png
`;
const texturePng = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3fKQ6QAAAABJRU5ErkJggg==',
    'base64',
  ),
);
const nativeHostSupported =
  (process.platform === 'darwin' && process.arch === 'arm64') ||
  (process.platform === 'linux' && process.arch === 'x64') ||
  (process.platform === 'win32' && process.arch === 'x64');

type Backend = 'native' | 'wasm';
type AssimpContext = { readonly assimp: Assimp };
type Fixture = Readonly<{ entry: string; sidecarFile: string }>;
type SidecarReader = (path: string) => Promise<Uint8Array<ArrayBuffer>>;

const kernelDefinition = await resolveRuntimePluginDefinition<AnyKernelDefinition>('kernel', assimpKernel());
const transcoderDefinition = await resolveRuntimePluginDefinition('transcoder', assimpTranscoder());

const withWatchdog = async <Value>(promise: Promise<Value>, label: string): Promise<Value> => {
  const watchdogResult = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    watchdogResult.reject(new Error(`${label} did not settle within ${watchdogMilliseconds}ms`));
  }, watchdogMilliseconds);
  try {
    return await Promise.race([promise, watchdogResult.promise]);
  } finally {
    clearTimeout(timer);
  }
};

const withFixture = async <Value>(run: (fixture: Fixture) => Promise<Value>): Promise<Value> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-assimp-integration-'));
  const sidecar = new Uint8Array(78);
  const view = new DataView(sidecar.buffer);
  for (const [index, value] of [0, 0, 0, 1, 0, 0, 0, 1, 0].entries()) {
    view.setFloat32(index * 4, value, true);
  }
  for (const [index, value] of [0, 0, 1, 0, 0, 1, 0, 0, 1].entries()) {
    view.setFloat32(36 + index * 4, value, true);
  }
  for (const [index, value] of [0, 1, 2].entries()) {
    view.setUint16(72 + index * 2, value, true);
  }
  const entry = JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ uri: 'triangle.bin', byteLength: sidecar.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34_962 },
      { buffer: 0, byteOffset: 36, byteLength: 36, target: 34_962 },
      { buffer: 0, byteOffset: 72, byteLength: 6, target: 34_963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics are uppercase by specification.
    meshes: [{ name: 'Triangle', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, mode: 4 }] }],
    nodes: [{ name: 'Triangle', mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  });
  const sidecarFile = join(directory, 'triangle.bin');

  try {
    await writeFile(sidecarFile, sidecar);
    return await run({ entry, sidecarFile });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const createContext = async (backend: Backend): Promise<AssimpContext> => {
  const assimp = await createAssimp({ backend });
  expect(assimp.backend).toBe(backend);
  return { assimp };
};

const createRuntime = (fixture: Fixture, options?: Readonly<{ signal?: AbortSignal; readSidecar?: SidecarReader }>) => {
  const readSidecar = options?.readSidecar ?? (async () => new Uint8Array(await readFile(fixture.sidecarFile)));
  return {
    ...createMockKernelRuntime({
      ...(options?.signal === undefined ? {} : { signal: options.signal }),
      filesystemOverrides: { readFileResult: readSidecar },
    }),
    fileContentCache: new Map<string, Uint8Array<ArrayBuffer> | string>([[entryPath, fixture.entry]]),
  };
};

const zipEntries = (zip: Uint8Array<ArrayBuffer>): ReadonlyMap<string, Uint8Array<ArrayBuffer>> => {
  const buffer = Buffer.from(zip);
  const entries = new Map<string, Uint8Array<ArrayBuffer>>();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04_03_4b_50) {
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const start = offset + 30 + nameLength + buffer.readUInt16LE(offset + 28);
    const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLength);
    const data = buffer.subarray(start, start + compressedSize);
    entries.set(name, new Uint8Array(compression === 8 ? inflateRawSync(data) : data));
    offset = start + compressedSize;
  }
  return entries;
};

const expectClosedTexturedExport = async (context: AssimpContext): Promise<void> => {
  const runtime = {
    ...createMockKernelRuntime(),
    fileContentCache: new Map<string, Uint8Array<ArrayBuffer> | string>([
      [texturedEntryPath, texturedObject],
      ['textured/cube.mtl', texturedMaterial],
      ['textured/tau-texture.png', texturePng],
    ]),
  };
  const preview = await kernelDefinition.createGeometry(
    { entryPath: texturedEntryPath, parameters: {} },
    runtime,
    context,
  );
  const glb = preview.geometry?.format === 'gltf' ? preview.geometry.content : undefined;
  expect(glb).toBeDefined();
  const document = await glbToDocument(glb!);
  expect(document.getRoot().listTextures()[0]?.getImage()).toEqual(texturePng);

  const converted = await context.assimp.convert({ name: 'preview.glb', bytes: glb! }, { to: 'usdz' });
  const usdz = converted.files.find(({ name }) => name.endsWith('.usdz'));
  expect(usdz).toBeDefined();
  const entries = zipEntries(new Uint8Array(usdz!.bytes));
  const usdEntry = [...entries.entries()].find(([name]) => /\.usd[ac]?$/u.test(name));
  expect(usdEntry).toBeDefined();
  const usd = new TextDecoder().decode(usdEntry![1]);
  const textureReference = /asset inputs:file = @\.\/([^@]+)@/u.exec(usd)?.[1];
  expect(textureReference).toBeDefined();
  expect(entries.get(textureReference!)).toBeDefined();
  expect(entries.get(textureReference!)?.subarray(0, 8)).toEqual(texturePng.subarray(0, 8));
};

const expectOneSidecarRead = (runtime: ReturnType<typeof createRuntime>): void => {
  expect(runtime.fileContentCache.has(sidecarPath)).toBe(false);
  expect(runtime.filesystem.mocks.readFile).toHaveBeenCalledExactlyOnceWith(sidecarPath, undefined);
  expect(runtime.filesystem.mocks.exists).not.toHaveBeenCalled();
  expect(runtime.filesystem.mocks.readdir).not.toHaveBeenCalled();
  expect(runtime.filesystem.mocks.stat).not.toHaveBeenCalled();
};

const expectTriangleGeometry = async (bytes: Uint8Array<ArrayBuffer>): Promise<void> => {
  const document = await glbToDocument(bytes);
  const meshes = document.getRoot().listMeshes();
  expect(meshes).toHaveLength(1);
  const primitives = meshes[0]!.listPrimitives();
  expect(primitives).toHaveLength(1);
  const primitive = primitives[0]!;
  expect(primitive.getAttribute('POSITION')?.getCount()).toBe(3);
  expect(primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount()).toBe(3);

  const report = await getInspectReport(bytes);
  expect(report.meshes.properties).toHaveLength(1);
  expect(getBoundingBoxFromInspect(report)).toEqual({
    size: [1, 1, 0],
    center: [0.5, 0.5, 0],
  });
};

const render = async (
  context: AssimpContext,
  runtime: ReturnType<typeof createRuntime>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const result: CreateGeometryOutput<Uint8Array<ArrayBuffer>> = await kernelDefinition.createGeometry(
    { entryPath, parameters: {} },
    runtime,
    context,
  );
  expect(result.geometry?.format).toBe('gltf');
  if (result.geometry?.format !== 'gltf') {
    throw new Error('Assimp kernel returned no GLB geometry');
  }
  expect(result.nativeHandle).toEqual(result.geometry.content);
  await expectTriangleGeometry(result.geometry.content);
  return result.geometry.content;
};

const renderWithDiskSidecar = async (context: AssimpContext, fixture: Fixture): Promise<Uint8Array<ArrayBuffer>> => {
  const runtime = createRuntime(fixture);
  const bytes = await render(context, runtime);
  expectOneSidecarRead(runtime);
  return bytes;
};

const cleanupContext = async (context: AssimpContext, label: string): Promise<void> => {
  await withWatchdog(Promise.resolve(kernelDefinition.cleanup?.(context)), `${label} cleanup`);
};

const exerciseCancellation = async (
  fixture: Fixture,
  options: Readonly<{ backend: Backend; lateSettlement: 'resolve' | 'reject' }>,
): Promise<void> => {
  const context = await createContext(options.backend);
  const opened = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const readerSettled = Promise.withResolvers<void>();
  const controller = new AbortController();
  const reason = { backend: options.backend, lateSettlement: options.lateSettlement };
  let readerOpened = false;
  let released = false;
  let pending: Promise<CreateGeometryOutput<Uint8Array<ArrayBuffer>>> | undefined;

  const settleReader = async (): Promise<void> => {
    if (released) {
      return;
    }
    released = true;
    release.resolve();
    if (readerOpened) {
      await withWatchdog(readerSettled.promise, `${options.backend} late ${options.lateSettlement}`);
    }
  };

  try {
    const expected = await renderWithDiskSidecar(context, fixture);
    const runtime = createRuntime(fixture, {
      signal: controller.signal,
      readSidecar: async () => {
        readerOpened = true;
        opened.resolve();
        await release.promise;
        try {
          if (options.lateSettlement === 'reject') {
            throw new Error('late filesystem rejection');
          }
          return new Uint8Array(await readFile(fixture.sidecarFile));
        } finally {
          readerSettled.resolve();
        }
      },
    });
    pending = kernelDefinition.createGeometry({ entryPath, parameters: {} }, runtime, context);
    await withWatchdog(opened.promise, `${options.backend} sidecar open`);
    expectOneSidecarRead(runtime);

    controller.abort(reason);
    await expect(withWatchdog(pending, `${options.backend} cancellation`)).rejects.toBe(reason);
    await settleReader();

    const recovered = await renderWithDiskSidecar(context, fixture);
    expect(recovered).toEqual(expected);
  } finally {
    await settleReader();
    if (pending !== undefined) {
      await withWatchdog(
        pending.then(
          () => undefined,
          () => undefined,
        ),
        `${options.backend} cancelled conversion cleanup`,
      );
    }
    await cleanupContext(context, options.backend);
  }
};

const transcodeToPly = async (
  context: Awaited<ReturnType<typeof transcoderDefinition.initialize>>,
  bytes: Uint8Array<ArrayBuffer>,
  signal = new AbortController().signal,
) => {
  const runtime = createMockKernelRuntime({ signal });
  return transcoderDefinition.transcode(
    { from: 'glb', to: 'ply', files: [createExportFile('glb', 'triangle.glb', bytes)], options: {} },
    runtime,
    context,
  );
};

const expectNativePlyRoundTrip = async (
  file: Readonly<{ name: string; bytes: Uint8Array<ArrayBuffer> }>,
): Promise<void> => {
  const assimp = await createAssimp({ backend: 'native' });
  try {
    expect(assimp.backend).toBe('native');
    const converted = await assimp.convert(file, { to: 'glb' });
    expect(converted.files).toHaveLength(1);
    await expectTriangleGeometry(new Uint8Array(converted.files[0]!.bytes));
  } finally {
    assimp.dispose();
  }
};

describe('assimp real backend integration', () => {
  describe('forced Wasm kernel context', () => {
    it('should keep preview textures embedded through a later USDZ conversion', async () => {
      const context = await createContext('wasm');
      try {
        await expectClosedTexturedExport(context);
      } finally {
        await cleanupContext(context, 'wasm textured export');
      }
    }, 30_000);

    it('should repeatedly import a cached glTF entry with one real filesystem sidecar read', async () => {
      await withFixture(async (fixture) => {
        const context = await createContext('wasm');
        try {
          const first = await renderWithDiskSidecar(context, fixture);
          const second = await renderWithDiskSidecar(context, fixture);
          expect(second).toEqual(first);
        } finally {
          await cleanupContext(context, 'wasm');
        }
      });
    }, 30_000);

    it.each(['resolve', 'reject'] as const)(
      'should cancel a pending sidecar before its late %s and recover',
      async (lateSettlement) => {
        await withFixture(async (fixture) => {
          await exerciseCancellation(fixture, { backend: 'wasm', lateSettlement });
        });
      },
      30_000,
    );
  });

  describe.skipIf(!nativeHostSupported)('forced native kernel context on supported desktop hosts', () => {
    it('should keep preview textures embedded through a later USDZ conversion', async () => {
      const context = await createContext('native');
      try {
        await expectClosedTexturedExport(context);
      } finally {
        await cleanupContext(context, 'native textured export');
      }
    }, 30_000);

    it('should repeatedly produce the exact forced-Wasm GLB bytes', async () => {
      await withFixture(async (fixture) => {
        const wasm = await createContext('wasm');
        const native = await createContext('native');
        try {
          const wasmFirst = await renderWithDiskSidecar(wasm, fixture);
          const wasmSecond = await renderWithDiskSidecar(wasm, fixture);
          const nativeFirst = await renderWithDiskSidecar(native, fixture);
          const nativeSecond = await renderWithDiskSidecar(native, fixture);
          expect(wasmSecond).toEqual(wasmFirst);
          expect(nativeFirst).toEqual(wasmFirst);
          expect(nativeSecond).toEqual(wasmFirst);
        } finally {
          await cleanupContext(native, 'native');
          await cleanupContext(wasm, 'wasm');
        }
      });
    }, 30_000);

    it.each(['resolve', 'reject'] as const)(
      'should cancel a pending sidecar before its late %s and recover',
      async (lateSettlement) => {
        await withFixture(async (fixture) => {
          await exerciseCancellation(fixture, { backend: 'native', lateSettlement });
        });
      },
      30_000,
    );

    it('should transcode through the forced-native capability and preserve triangle geometry on round trip', async () => {
      await withFixture(async (fixture) => {
        const sourceContext = await createContext('wasm');
        const initializeRuntime = createMockKernelRuntime();
        const context = await transcoderDefinition.initialize({ backend: 'native' }, initializeRuntime);
        try {
          expect(initializeRuntime.logger.log).toHaveBeenCalledWith(
            expect.stringMatching(/^libassimp backend=native /u),
          );
          const source = await renderWithDiskSidecar(sourceContext, fixture);
          const result = await transcodeToPly(context, source);
          assertSuccess(result, 'forced-native GLB to PLY');
          expect(result.data).toHaveLength(1);
          expect(result.data[0]).toMatchObject({ name: 'result.ply', mimeType: 'application/x-ply' });
          await expectNativePlyRoundTrip(result.data[0]!);
        } finally {
          await withWatchdog(Promise.resolve(transcoderDefinition.cleanup?.(context)), 'native transcoder cleanup');
          await cleanupContext(sourceContext, 'wasm source');
        }
      });
    }, 30_000);

    it('should cancel from the runtime signal and recover the forced-native transcoder', async () => {
      await withFixture(async (fixture) => {
        const sourceContext = await createContext('wasm');
        const initializeRuntime = createMockKernelRuntime();
        const context = await transcoderDefinition.initialize({ backend: 'native' }, initializeRuntime);
        try {
          expect(initializeRuntime.logger.log).toHaveBeenCalledWith(
            expect.stringMatching(/^libassimp backend=native /u),
          );
          const source = await renderWithDiskSidecar(sourceContext, fixture);
          const controller = new AbortController();
          const reason = new Error('native transcoder cancelled');
          controller.abort(reason);

          const cancelled = await withWatchdog(
            transcodeToPly(context, source, controller.signal),
            'native transcoder cancellation',
          );
          assertFailure(cancelled, 'forced-native cancellation');
          expect(cancelled.issues).toEqual([
            {
              message: reason.message,
              code: 'RUNTIME',
              type: 'runtime',
              severity: 'error',
            },
          ]);

          const recovered = await transcodeToPly(context, source);
          assertSuccess(recovered, 'forced-native recovery');
          expect(recovered.data).toHaveLength(1);
          expect(recovered.data[0]).toMatchObject({
            name: 'result.ply',
            mimeType: 'application/x-ply',
          });
          await expectNativePlyRoundTrip(recovered.data[0]!);
        } finally {
          await withWatchdog(Promise.resolve(transcoderDefinition.cleanup?.(context)), 'native transcoder cleanup');
          await cleanupContext(sourceContext, 'wasm source');
        }
      });
    }, 30_000);
  });
});
