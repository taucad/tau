import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExportFile } from '@taucad/runtime/types';
import type { TranscoderRuntime } from '@taucad/runtime/transcoder';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import * as libassimpExporter from 'libassimp';
import { assimpEdgeSchemas } from '#assimp-export-options.js';
import { assimpTranscoder } from '#assimp.transcoder.js';

const assimpMock = vi.hoisted(() => ({
  convert: vi.fn(),
  createAssimp: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('libassimp', async (importOriginal) => ({
  ...(await importOriginal<typeof libassimpExporter>()),
  createAssimp: assimpMock.createAssimp,
}));

const createRuntime = (): TranscoderRuntime => ({
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
    assimpMock.createAssimp.mockResolvedValue({
      convert: assimpMock.convert,
      dispose: assimpMock.dispose,
    });
    assimpMock.convert.mockResolvedValue({
      files: [{ name: 'result.stl', bytes: new Uint8Array([1, 2, 3]) }],
    });
  });

  it('derives exactly the 26 policy routes from libassimp', async () => {
    const resolved = await definition();
    const expected = libassimpExporter.conversionEdges.filter(
      ({ from, to }) => (from === 'glb' || from === 'gltf') && to !== 'assjson',
    );

    expect(resolved.edges.map(({ from, to }) => ({ from, to }))).toEqual(expected);
    expect(resolved.edges).toHaveLength(26);
    expect(resolved.edges.filter(({ from }) => from === 'glb')).toHaveLength(13);
    expect(resolved.edges.filter(({ from }) => from === 'gltf')).toHaveLength(13);
    for (const edge of resolved.edges) {
      expect(edge.fidelity).toBe('mesh');
      expect(edge.optionsSchema).toBe(assimpEdgeSchemas[edge.to as keyof typeof assimpEdgeSchemas]);
      expect(edge.sourceOptions).toEqual({ coordinateSystem: 'y-up', unit: { length: 'meter' } });
    }
  });

  it('creates one exporter instance and disposes it during cleanup', async () => {
    const resolved = await definition();
    const runtime = createRuntime();
    const context = await resolved.initialize({}, runtime);

    expect(assimpMock.createAssimp).toHaveBeenCalledOnce();
    expect(assimpMock.createAssimp).toHaveBeenCalledWith();
    await resolved.cleanup?.(context);
    expect(assimpMock.dispose).toHaveBeenCalledOnce();
  });

  it('passes every glTF input file and public target options to libassimp', async () => {
    const resolved = await definition();
    const runtime = createRuntime();
    const context = await resolved.initialize({}, runtime);
    const inputs = [file('model.gltf'), file('model.bin', new Uint8Array([4, 5, 6]))];

    await resolved.transcode({ from: 'gltf', to: 'stl', files: inputs, options: { binary: true } }, runtime, context);

    expect(assimpMock.convert).toHaveBeenCalledWith(
      inputs.map(({ name, bytes }) => ({ name, bytes })),
      { to: 'stl', exportOptions: { binary: true } },
    );
  });

  it('preserves sidecar order, copies bytes, maps MIME types, and normalizes STEP', async () => {
    const primary = new Uint8Array([7, 8, 9]);
    const sidecar = new Uint8Array([10, 11]);
    assimpMock.convert.mockResolvedValue({
      files: [
        { name: 'result.stp', bytes: primary },
        { name: 'material.mtl', bytes: sidecar },
      ],
    });
    const resolved = await definition();
    const runtime = createRuntime();
    const context = await resolved.initialize({}, runtime);
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
      { name: 'result.step', mimeType: 'application/step' },
      { name: 'material.mtl', mimeType: 'application/octet-stream' },
    ]);
    expect(result.data[0]?.bytes).toEqual(primary);
    expect(result.data[0]?.bytes).not.toBe(primary);
    expect(result.data[1]?.bytes).toEqual(sidecar);
  });

  it.each([
    ['glb', 'gltf'],
    ['gltf', 'glb'],
  ] as const)('executes the %s -> %s route', async (from, to) => {
    const resolved = await definition();
    const runtime = createRuntime();
    const context = await resolved.initialize({}, runtime);

    const result = await resolved.transcode(
      { from, to, files: [file(`model.${from}`)], options: {} },
      runtime,
      context,
    );

    expect(result.success).toBe(true);
    expect(assimpMock.convert).toHaveBeenCalledWith(expect.any(Array), { to, exportOptions: {} });
  });

  it('maps missing inputs and libassimp failures to runtime issues', async () => {
    const resolved = await definition();
    const runtime = createRuntime();
    const context = await resolved.initialize({}, runtime);

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
});
