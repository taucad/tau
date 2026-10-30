import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExportFile } from '@taucad/runtime/types';
import type { TranscoderServices } from '@taucad/runtime/transcoder';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import * as libassimpExporter from 'libassimp';
import type { CreateAssimpOptions } from 'libassimp';
import { assimpEdgeSchemas } from '#assimp-export-options.js';
import { assimpTranscoder } from '#assimp.transcoder.js';

const assimpMock = vi.hoisted(() => ({
  convert: vi.fn(),
  createAssimp: vi.fn(),
  dispose: vi.fn(),
}));
const requestedBackends: Array<CreateAssimpOptions['backend']> = [];

vi.mock('libassimp', async (importOriginal) => ({
  ...(await importOriginal<typeof libassimpExporter>()),
  createAssimp: assimpMock.createAssimp,
}));

const createRuntime = (): TranscoderServices => ({
  logger: { log: vi.fn(), debug: vi.fn(), trace: vi.fn(), warn: vi.fn(), error: vi.fn(), custom: vi.fn() },
  tracer: { startSpan: vi.fn() },
  signal: new AbortController().signal,
});

const file = (name: string, bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46])): ExportFile => ({
  name,
  bytes,
  mimeType: name.endsWith('.gltf') ? 'model/gltf+json' : 'model/gltf-binary',
});

describe('assimp transcoder', () => {
  const definition = async () => resolveRuntimePluginDefinition('transcoder', assimpTranscoder());

  beforeEach(() => {
    vi.clearAllMocks();
    requestedBackends.length = 0;
    assimpMock.createAssimp.mockImplementation(async (options: CreateAssimpOptions) => {
      requestedBackends.push(options.backend);
      options.onLog?.({ level: 'warning', message: 'native unavailable', cause: 'missing addon' });
      return {
        backend: 'native',
        buildIdentity: 'darwin-arm64-napi8',
        convert: assimpMock.convert,
        dispose: assimpMock.dispose,
      };
    });
    assimpMock.convert.mockResolvedValue({
      files: [{ name: 'model.stl', bytes: new Uint8Array([1, 2, 3]) }],
    });
  });

  it('derives exactly the 22 policy routes from libassimp', async () => {
    const resolved = await definition();
    const expected = libassimpExporter.conversionEdges.filter(
      ({ from, to }) => (from === 'glb' || from === 'gltf') && to !== 'assjson',
    );

    expect(resolved.edges.map(({ from, to }) => ({ from, to }))).toEqual(expected);
    expect(resolved.edges).toHaveLength(22);
    expect(resolved.edges.filter(({ from }) => from === 'glb')).toHaveLength(11);
    expect(resolved.edges.filter(({ from }) => from === 'gltf')).toHaveLength(11);
    for (const edge of resolved.edges) {
      expect(edge.fidelity).toBe('mesh');
      expect(edge.optionsSchema).toBe(assimpEdgeSchemas[edge.to as keyof typeof assimpEdgeSchemas]);
      expect(edge.sourceOptions).toEqual({ coordinateSystem: 'y-up', unit: { length: 'meter' } });
    }
  });

  it.each(['auto', 'native', 'wasm'] as const)(
    'creates one %s exporter instance and disposes it during cleanup',
    async (backend) => {
      const resolved = await definition();
      const runtime = createRuntime();
      const context = await resolved.initialize({ backend }, runtime);

      expect(assimpMock.createAssimp).toHaveBeenCalledOnce();
      expect(requestedBackends).toEqual([backend]);
      expect(runtime.logger.custom).toHaveBeenCalledWith('warn', 'native unavailable', {
        data: 'missing addon',
      });
      expect(runtime.logger.log).toHaveBeenCalledWith('libassimp backend=native addon=darwin-arm64-napi8');
      await resolved.onDispose?.(context);
      expect(assimpMock.dispose).toHaveBeenCalledOnce();
    },
  );

  it('should preserve non-warning log levels and report an absent native build identity', async () => {
    const cause = new Error('wasm diagnostic cause');
    assimpMock.createAssimp.mockImplementationOnce(async (options: CreateAssimpOptions) => {
      options.onLog?.({ level: 'error', message: 'wasm diagnostic', cause });
      return {
        backend: 'wasm',
        convert: assimpMock.convert,
        dispose: assimpMock.dispose,
      };
    });
    const resolved = await definition();
    const runtime = createRuntime();

    await resolved.initialize({ backend: 'wasm' }, runtime);

    expect(runtime.logger.custom).toHaveBeenCalledWith('error', 'wasm diagnostic', { data: cause });
    expect(runtime.logger.log).toHaveBeenCalledWith('libassimp backend=wasm addon=none');
  });

  it('passes every glTF input file and public target options to libassimp', async () => {
    const resolved = await definition();
    const runtime = createRuntime();
    const context = await resolved.initialize({ backend: 'auto' }, runtime);
    const inputs = [file('model.gltf'), file('model.bin', new Uint8Array([4, 5, 6]))];

    await resolved.transcode({ from: 'gltf', to: 'stl', files: inputs, options: { binary: true } }, runtime, context);

    expect(assimpMock.convert).toHaveBeenCalledWith(
      inputs.map(({ name, bytes }) => ({ name, bytes })),
      { to: 'stl', exportOptions: { binary: true }, signal: runtime.signal },
    );
  });

  it('preserves sidecar order, copies bytes, and maps MIME types', async () => {
    const primary = new Uint8Array([7, 8, 9]);
    const sidecar = new Uint8Array([10, 11]);
    assimpMock.convert.mockResolvedValue({
      files: [
        { name: 'model.step', bytes: primary },
        { name: 'material.mtl', bytes: sidecar },
      ],
    });
    const resolved = await definition();
    const runtime = createRuntime();
    const context = await resolved.initialize({ backend: 'auto' }, runtime);
    const result = await resolved.transcode(
      { from: 'glb', to: 'step', files: [file('model.glb')], options: {} },
      runtime,
      context,
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.map(({ name, mimeType }) => ({ name, mimeType }))).toEqual([
      { name: 'model.step', mimeType: 'application/step' },
      { name: 'material.mtl', mimeType: 'application/octet-stream' },
    ]);
    expect(result.data[0]?.bytes).toEqual(primary);
    expect(result.data[0]?.bytes).not.toBe(primary);
    expect(result.data[1]?.bytes).toEqual(sidecar);
  });

  it('should use the fallback MIME type when suffix parsing returns no segment', async () => {
    const resolved = await definition();
    const runtime = createRuntime();
    const context = await resolved.initialize({ backend: 'auto' }, runtime);
    assimpMock.convert.mockResolvedValueOnce({
      files: [{ name: 'README', bytes: new Uint8Array([1, 2, 3]) }],
    });
    const split = vi.spyOn(String.prototype, 'split').mockReturnValueOnce([]);

    try {
      const result = await resolved.transcode(
        { from: 'glb', to: 'stl', files: [file('model.glb')], options: {} },
        runtime,
        context,
      );

      expect(result).toEqual({
        success: true,
        data: [{ name: 'README', bytes: new Uint8Array([1, 2, 3]), mimeType: 'application/octet-stream' }],
        issues: [],
      });
    } finally {
      split.mockRestore();
    }
  });

  it.each([
    ['glb', 'gltf'],
    ['gltf', 'glb'],
  ] as const)('executes the %s -> %s route', async (from, to) => {
    const resolved = await definition();
    const runtime = createRuntime();
    const context = await resolved.initialize({ backend: 'auto' }, runtime);

    const result = await resolved.transcode(
      { from, to, files: [file(`model.${from}`)], options: {} },
      runtime,
      context,
    );

    expect(result.success).toBe(true);
    expect(assimpMock.convert).toHaveBeenCalledWith(expect.any(Array), {
      to,
      exportOptions: {},
      signal: runtime.signal,
    });
  });

  it('maps missing inputs and libassimp failures to runtime issues', async () => {
    const resolved = await definition();
    const runtime = createRuntime();
    const context = await resolved.initialize({ backend: 'auto' }, runtime);

    const missing = await resolved.transcode({ from: 'glb', to: 'stl', files: [], options: {} }, runtime, context);
    assimpMock.convert.mockRejectedValueOnce(new Error('EXPORT_FAILED at target 0'));
    const failed = await resolved.transcode(
      { from: 'glb', to: 'stl', files: [file('model.glb')], options: {} },
      runtime,
      context,
    );

    expect(missing.success ? undefined : missing.issues[0]?.message).toContain('No input files');
    expect(failed.success ? undefined : failed.issues[0]?.message).toContain('EXPORT_FAILED');
  });

  it('should map non-Error conversion failures to the stable runtime message', async () => {
    assimpMock.convert.mockRejectedValueOnce('native panic');
    const resolved = await definition();
    const runtime = createRuntime();
    const context = await resolved.initialize({ backend: 'auto' }, runtime);

    const result = await resolved.transcode(
      { from: 'glb', to: 'stl', files: [file('model.glb')], options: {} },
      runtime,
      context,
    );

    expect(result).toEqual({
      success: false,
      issues: [{ message: 'Transcoding failed', code: 'RUNTIME', type: 'runtime', severity: 'error' }],
    });
  });

  describe('hidden export options', () => {
    const json = (meshes: unknown): Uint8Array<ArrayBuffer> =>
      new TextEncoder().encode(JSON.stringify({ asset: {}, meshes }));
    const glb = (meshes: unknown): Uint8Array<ArrayBuffer> => {
      const body = json(meshes);
      const padded = new Uint8Array(Math.ceil(body.byteLength / 4) * 4).fill(0x20);
      padded.set(body);
      const bytes = new Uint8Array(20 + padded.byteLength);
      const view = new DataView(bytes.buffer);
      view.setUint32(0, 0x46_54_6c_67, true);
      view.setUint32(4, 2, true);
      view.setUint32(8, bytes.byteLength, true);
      view.setUint32(12, padded.byteLength, true);
      view.setUint32(16, 0x4e_4f_53_4a, true);
      bytes.set(padded, 20);
      return bytes;
    };
    const exported = async (
      to: 'stl' | '3mf',
      files: ExportFile[],
      options: Record<string, unknown> = {},
    ): Promise<unknown> => {
      const resolved = await definition();
      const runtime = createRuntime();
      const context = await resolved.initialize({ backend: 'auto' }, runtime);
      await resolved.transcode({ from: 'glb', to, files, options }, runtime, context);
      const [, convertOptions] = assimpMock.convert.mock.calls.at(-1) as [unknown, { exportOptions: unknown }];
      return convertOptions.exportOptions;
    };
    const points = [{ primitives: [{ mode: 0 }, { mode: 0 }] }];

    it('should send the application name with every 3MF export', async () => {
      expect(await exported('3mf', [file('model.glb')], { unit: 'inch' })).toEqual({
        application: 'Tau',
        unit: 'inch',
      });
    });

    it.each([
      ['a GLB', () => [file('model.glb', glb(points))]],
      ['a glTF file', () => [file('model.gltf', json(points)), file('model.bin', new Uint8Array([1]))]],
    ])('should enable point clouds when every primitive in %s draws points', async (_name, files) => {
      expect(await exported('stl', files(), { binary: false })).toEqual({ binary: false, pointClouds: true });
    });

    it.each([
      ['a mesh with faces', [file('model.glb', glb([{ primitives: [{ mode: 0 }, {}] }]))]],
      ['a model with no meshes', [file('model.glb', glb(undefined))]],
      ['a mesh with no primitives', [file('model.glb', glb([{}]))]],
      ['bytes that are not GLB', [file('model.glb', new Uint8Array(24))]],
      ['a truncated GLB', [file('model.glb', new Uint8Array([1, 2, 3]))]],
      ['glTF JSON that does not parse', [file('model.gltf', new TextEncoder().encode('{'))]],
    ])('should leave point clouds off for %s', async (_name, files) => {
      expect(await exported('stl', files, { binary: true })).toEqual({ binary: true });
    });
  });

  it.each([
    [
      new libassimpExporter.AssimpError('LIMIT_EXCEEDED', 'USD export: USDC serialisation failed.'),
      'USD export: USDC serialisation failed. The model is too large to export here. Try a coarser tessellation.',
    ],
    [
      new Error('3MF mesh 0 is not manifold and oriented after geometry conversion'),
      '3MF mesh 0 is not manifold and oriented after geometry conversion The model has open or inconsistently oriented surfaces. Turn off Require manifold to export it anyway.',
    ],
  ])('should say what to change when a failure has a known fix', async (error, message) => {
    assimpMock.convert.mockRejectedValueOnce(error);
    const resolved = await definition();
    const runtime = createRuntime();
    const context = await resolved.initialize({ backend: 'auto' }, runtime);

    const result = await resolved.transcode(
      { from: 'glb', to: '3mf', files: [file('model.glb')], options: {} },
      runtime,
      context,
    );

    expect(result.success ? undefined : result.issues[0]?.message).toBe(message);
  });
});
