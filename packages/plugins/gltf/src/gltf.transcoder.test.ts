import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import type { Document, JSONDocument } from '@gltf-transform/core';
import { allExtensions, KittyCadBoundaryRepresentation, TauCadTopology } from '@taucad/geometry-core';
import { defineRuntime } from '@taucad/runtime';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import type { TranscoderRuntime } from '@taucad/runtime/transcoder';
import { kittyCadBoundaryRepresentationExtension, tauCadTopologyExtension } from '@taucad/runtime/types';
import type { ExportFile } from '@taucad/runtime/types';
import { createTestRuntimeClient } from '@taucad/runtime-testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import * as dracoBackend from '#draco-backend.js';
import { dracoExtensionName, loadDracoDecoder } from '#draco-backend.js';
import { gltf } from '#gltf.plugin.js';
import { gltfTranscodeOptionsSchema, gltfTranscoder } from '#gltf.transcoder.js';

const runtime: TranscoderRuntime = {
  logger: { log: vi.fn(), debug: vi.fn(), trace: vi.fn(), warn: vi.fn(), error: vi.fn(), custom: vi.fn() },
  tracer: { startSpan: vi.fn() },
  signal: new AbortController().signal,
};
const definition = await resolveRuntimePluginDefinition('transcoder', gltfTranscoder());
let context!: Awaited<ReturnType<typeof definition.initialize>>;

beforeAll(async () => {
  context = await definition.initialize({}, runtime);
});

const fixture = (name: string): ExportFile => ({
  name,
  bytes: new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url))),
  mimeType: name.endsWith('.gltf') ? 'model/gltf+json' : 'application/octet-stream',
});

const inputFiles = (format: 'glb' | 'gltf', compression: 'none' | 'draco'): ExportFile[] => {
  if (format === 'glb') {
    return [fixture(compression === 'draco' ? 'cube-draco.glb' : 'cube.glb')];
  }
  return compression === 'draco'
    ? [fixture('cube-draco.gltf'), fixture('cube-draco-bin.bin')]
    : [fixture('cube-bin.gltf'), fixture('cube-bin.bin')];
};

const asJsonDocument = async (format: 'glb' | 'gltf', files: readonly ExportFile[]): Promise<JSONDocument> => {
  if (format === 'glb') {
    return new NodeIO().binaryToJSON(files[0]!.bytes);
  }
  const jsonFile = files.find(({ name }) => name.endsWith('.gltf'))!;
  const json = JSON.parse(new TextDecoder().decode(jsonFile.bytes)) as JSONDocument['json'];
  return {
    json,
    resources: Object.fromEntries(files.filter((file) => file !== jsonFile).map(({ name, bytes }) => [name, bytes])),
  };
};

const geometrySummary = (document: Document) => {
  const root = document.getRoot();
  const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
  const parents = new Map<string, string>();
  const find = (key: string): string => {
    const parent = parents.get(key)!;
    if (parent === key) {
      return key;
    }
    const rootKey = find(parent);
    parents.set(key, rootKey);
    return rootKey;
  };
  const union = (left: string, right: string) => parents.set(find(right), find(left));
  const positions = primitives.flatMap((primitive) => {
    const accessor = primitive.getAttribute('POSITION')!;
    const indices = primitive.getIndices();
    const vertexKey = (index: number) => accessor.getElement(index, []).join(',');
    const count = indices?.getCount() ?? accessor.getCount();
    for (let offset = 0; offset < count; offset += 3) {
      const keys = [0, 1, 2].map((index) => vertexKey(indices?.getScalar(offset + index) ?? offset + index));
      for (const key of keys) {
        parents.set(key, parents.get(key) ?? key);
      }
      union(keys[0]!, keys[1]!);
      union(keys[0]!, keys[2]!);
    }
    return Array.from({ length: accessor.getCount() }, (_, index) => accessor.getElement(index, []) as number[]);
  });
  const uniquePositions = [...new Map(positions.map((position) => [position.join(','), position])).values()].sort(
    (left, right) => left.join(',').localeCompare(right.join(',')),
  );
  let triangles = 0;
  for (const primitive of primitives) {
    const indices = primitive.getIndices();
    triangles += (indices?.getCount() ?? primitive.getAttribute('POSITION')!.getCount()) / 3;
  }
  const minimum: [number, number, number] = [Infinity, Infinity, Infinity];
  const maximum: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const position of uniquePositions) {
    for (const axis of [0, 1, 2] as const) {
      minimum[axis] = Math.min(minimum[axis], position[axis]!);
      maximum[axis] = Math.max(maximum[axis], position[axis]!);
    }
  }

  return {
    scenes: root.listScenes().length,
    nodes: root.listNodes().length,
    meshes: root.listMeshes().length,
    materials: root.listMaterials().length,
    primitives: primitives.length,
    triangles,
    connectedComponents: new Set([...parents.keys()].map((key) => find(key))).size,
    colors: root.listMaterials().map((material) => material.getBaseColorFactor()),
    bounds: [minimum, maximum] as const,
    uniquePositions,
  };
};

const expectGeometryPreserved = (
  actual: ReturnType<typeof geometrySummary>,
  expected: ReturnType<typeof geometrySummary>,
) => {
  expect({ ...actual, bounds: undefined, uniquePositions: undefined }).toEqual({
    ...expected,
    bounds: undefined,
    uniquePositions: undefined,
  });
  const positionTolerance =
    Math.max(...expected.bounds[1].map((maximum, axis) => maximum - expected.bounds[0][axis]!)) /
    (2 ** gltfTranscodeOptionsSchema.parse({}).quantizePosition - 1);
  expect(actual.uniquePositions).toHaveLength(expected.uniquePositions.length);
  for (const [index, position] of actual.uniquePositions.entries()) {
    for (const [axis, value] of position.entries()) {
      expect(Math.abs(value - expected.uniquePositions[index]![axis]!)).toBeLessThanOrEqual(positionTolerance);
    }
  }
  for (const [index, bound] of actual.bounds.flat().entries()) {
    expect(Math.abs(bound - expected.bounds.flat()[index]!)).toBeLessThanOrEqual(positionTolerance);
  }
};

const transcode = async (options: {
  readonly from: 'glb' | 'gltf';
  readonly to: 'glb' | 'gltf';
  readonly inputCompression: 'none' | 'draco';
  readonly outputCompression: 'none' | 'draco';
}) =>
  definition.transcode(
    {
      from: options.from,
      to: options.to,
      files: inputFiles(options.from, options.inputCompression),
      options: gltfTranscodeOptionsSchema.parse({ compression: options.outputCompression }),
    },
    runtime,
    context,
  );

const matrix = (['glb', 'gltf'] as const).flatMap((from) =>
  (['glb', 'gltf'] as const).flatMap((to) =>
    (['none', 'draco'] as const).flatMap((inputCompression) =>
      (['none', 'draco'] as const).map((outputCompression) => ({
        from,
        to,
        inputCompression,
        outputCompression,
      })),
    ),
  ),
);

describe('glTF transcoder', () => {
  it('declares the four same-format and cross-format routes', () => {
    expect(definition.edges.map(({ from, to }) => `${from}->${to}`)).toEqual([
      'glb->glb',
      'glb->gltf',
      'gltf->glb',
      'gltf->gltf',
    ]);
  });

  it.each(matrix)(
    '$from->$to converts $inputCompression input to $outputCompression output',
    async ({ from, to, inputCompression, outputCompression }) => {
      const decoderLoader = vi.spyOn(dracoBackend, 'loadDracoDecoder');
      const encoderLoader = vi.spyOn(dracoBackend, 'loadDracoEncoder');
      const result = await transcode({ from, to, inputCompression, outputCompression });
      expect(decoderLoader).toHaveBeenCalledTimes(inputCompression === 'draco' ? 1 : 0);
      expect(encoderLoader).toHaveBeenCalledTimes(outputCompression === 'draco' ? 1 : 0);
      decoderLoader.mockRestore();
      encoderLoader.mockRestore();

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }
      const jsonDocument = await asJsonDocument(to, result.data);
      expect(jsonDocument.json.extensionsUsed?.includes(dracoExtensionName) ?? false).toBe(
        outputCompression === 'draco',
      );
      expect(jsonDocument.json.extensionsRequired?.includes(dracoExtensionName) ?? false).toBe(
        outputCompression === 'draco',
      );
      expect(JSON.stringify(jsonDocument.json).includes(dracoExtensionName)).toBe(outputCompression === 'draco');

      const io = new NodeIO().registerExtensions(allExtensions);
      if (outputCompression === 'draco') {
        io.registerDependencies({ 'draco3d.decoder': await loadDracoDecoder() });
      }
      const document = await io.readJSON(jsonDocument);
      const expectedIo = new NodeIO().registerExtensions(allExtensions);
      if (inputCompression === 'draco') {
        expectedIo.registerDependencies({ 'draco3d.decoder': await loadDracoDecoder() });
      }
      const expected = await expectedIo.readJSON(await asJsonDocument(from, inputFiles(from, inputCompression)));
      expectGeometryPreserved(geometrySummary(document), geometrySummary(expected));
    },
  );

  it.each([
    {
      extension: tauCadTopologyExtension,
      add: async (document: Awaited<ReturnType<NodeIO['readBinary']>>) => {
        const extension = document.createExtension(TauCadTopology);
        document.getRoot().setExtension(tauCadTopologyExtension, extension.createRoot().setPayload({}));
      },
    },
    {
      extension: kittyCadBoundaryRepresentationExtension,
      add: async (document: Awaited<ReturnType<NodeIO['readBinary']>>) => {
        const extension = document.createExtension(KittyCadBoundaryRepresentation);
        document.getRoot().setExtension(kittyCadBoundaryRepresentationExtension, extension.createRoot().setPayload({}));
      },
    },
    {
      extension: 'primitive faceGroups extras',
      add: async (document: Awaited<ReturnType<NodeIO['readBinary']>>) => {
        document.getRoot().listMeshes()[0]!.listPrimitives()[0]!.setExtras({ faceGroups: [] });
      },
    },
    {
      extension: 'primitive edgeGroups extras',
      add: async (document: Awaited<ReturnType<NodeIO['readBinary']>>) => {
        document.getRoot().listMeshes()[0]!.listPrimitives()[0]!.setExtras({ edgeGroups: [] });
      },
    },
  ])('rejects Draco compression when $extension would be lost', async ({ add }) => {
    const encoderLoader = vi.spyOn(dracoBackend, 'loadDracoEncoder');
    const io = new NodeIO().registerExtensions(allExtensions);
    const document = await io.readBinary(inputFiles('glb', 'none')[0]!.bytes);
    await add(document);
    const input = await io.writeBinary(document);
    const result = await definition.transcode(
      {
        from: 'glb',
        to: 'glb',
        files: [{ name: 'model.glb', bytes: input, mimeType: 'model/gltf-binary' }],
        options: gltfTranscodeOptionsSchema.parse({ compression: 'draco' }),
      },
      runtime,
      context,
    );

    expect(result).toEqual({
      success: false,
      issues: [
        expect.objectContaining({
          code: 'RUNTIME_CONTENT_UNSUPPORTED',
          details: { operation: 'transcode', content: 'includeTopology', codec: 'draco' },
        }),
      ],
    });
    expect(encoderLoader).not.toHaveBeenCalled();
    encoderLoader.mockRestore();
  });

  it('returns runtime issues for missing or invalid input', async () => {
    const options = gltfTranscodeOptionsSchema.parse({});
    const missing = await definition.transcode({ from: 'glb', to: 'glb', files: [], options }, runtime, context);
    const invalid = await definition.transcode(
      {
        from: 'gltf',
        to: 'gltf',
        files: [{ name: 'broken.gltf', bytes: new TextEncoder().encode('{'), mimeType: 'model/gltf+json' }],
        options,
      },
      runtime,
      context,
    );

    expect(missing).toMatchObject({ success: false, issues: [{ code: 'RUNTIME' }] });
    expect(invalid).toMatchObject({ success: false, issues: [{ code: 'RUNTIME' }] });
  });

  it('dispatches same-format transcoding and rejects invalid options through RuntimeClient', async () => {
    const encoderLoader = vi.spyOn(dracoBackend, 'loadDracoEncoder');
    const pluginRuntime = defineRuntime({ plugins: [gltf()] });
    const client = createTestRuntimeClient({ runtime: pluginRuntime });
    const files = inputFiles('glb', 'none');

    try {
      const invalid = await client.transcode({
        from: 'glb',
        to: 'glb',
        files,
        options: { compression: 'draco', encodeSpeed: 11 },
      });
      expect(invalid).toMatchObject({ success: false, issues: [{ code: 'TRANSCODER_OPTIONS_INVALID' }] });
      expect(encoderLoader).not.toHaveBeenCalled();

      const valid = await client.transcode({ from: 'glb', to: 'glb', files, options: { compression: 'none' } });
      expect(valid).toMatchObject({ success: true, issues: [] });
    } finally {
      await client.shutdown();
      encoderLoader.mockRestore();
    }
  });
});
