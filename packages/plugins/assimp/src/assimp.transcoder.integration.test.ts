import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { esbuildBundler } from '@taucad/esbuild';
import { manifoldKernel } from '@taucad/manifold';
import { assertSuccess, createTestRuntimeClient, glbToDocument, validateGlbData } from '@taucad/runtime-testing';
import type { ExportFile } from '@taucad/runtime/types';
import type { TranscoderRuntime } from '@taucad/runtime/transcoder';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { defineRuntime } from '@taucad/runtime/worker';
import { createAssimp } from 'libassimp';
import type { Assimp, AssimpFile } from 'libassimp';

import { assimpTranscoder } from '#assimp.transcoder.js';

const runtime: TranscoderRuntime = {
  logger: {
    log: () => undefined,
    debug: () => undefined,
    trace: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    custom: () => undefined,
  },
  tracer: { startSpan: () => ({ end: () => undefined }) },
  signal: new AbortController().signal,
};

const definition = await resolveRuntimePluginDefinition('transcoder', assimpTranscoder());
const manifoldRuntime = defineRuntime({ kernels: [manifoldKernel()], bundlers: [esbuildBundler()] });
let fullAssimp!: Assimp;
let context!: Awaited<ReturnType<typeof definition.initialize>>;
let sources!: Readonly<Record<'glb' | 'gltf', ExportFile[]>>;

const toExportFiles = (files: readonly AssimpFile[]): ExportFile[] =>
  files.map(({ name, bytes }) => ({
    name,
    bytes: new Uint8Array(bytes),
    mimeType: 'application/octet-stream',
  }));

const triangleCount = async (bytes: Uint8Array<ArrayBuffer>): Promise<number> => {
  const document = await glbToDocument(bytes);
  let count = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indexCount = primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0;
      count += indexCount / 3;
    }
  }
  return count;
};

const roundNumbers = (values: readonly number[]): number[] => values.map((value) => Math.round(value * 1e6) / 1e6);

const sourceManifoldTopology = async (
  bytes: Uint8Array<ArrayBuffer>,
): Promise<{ positions: number[]; indices: number[]; runs: number[] }> => {
  const document = await glbToDocument(bytes);
  const node = document
    .getRoot()
    .listNodes()
    .find((candidate) => candidate.getMesh() !== null);
  const mesh = node?.getMesh();
  const position = mesh?.listPrimitives()[0]?.getAttribute('POSITION');
  const manifold = mesh?.getExtension('EXT_mesh_manifold') as unknown as
    | {
        getIndices: () => { getArray: () => Iterable<number> | undefined };
        getRunIndex: () => Iterable<number>;
      }
    | undefined;
  const indexArray = manifold?.getIndices().getArray();
  if (
    node === undefined ||
    position === null ||
    position === undefined ||
    manifold === undefined ||
    indexArray === undefined
  ) {
    throw new Error('GLB has no EXT_mesh_manifold topology');
  }
  const matrix = node.getWorldMatrix();
  const positions: number[] = [];
  for (let index = 0; index < position.getCount(); index += 1) {
    const [x, y, z] = position.getElement(index, [0, 0, 0]);
    positions.push(
      matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
      matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
      matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    );
  }
  return {
    positions: roundNumbers(positions),
    indices: [...indexArray],
    runs: [...manifold.getRunIndex()],
  };
};

const toThreeMfPositions = (positions: readonly number[]): number[] => {
  const result: number[] = [];
  for (let index = 0; index < positions.length; index += 3) {
    result.push(positions[index]! * 1000, -positions[index + 2]! * 1000, positions[index + 1]! * 1000);
  }
  return roundNumbers(result);
};

const orientedIndices = (positions: readonly number[], indices: readonly number[]): number[] => {
  let volumeTimesSix = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index]! * 3;
    const b = indices[index + 1]! * 3;
    const c = indices[index + 2]! * 3;
    volumeTimesSix +=
      positions[a]! * (positions[b + 1]! * positions[c + 2]! - positions[b + 2]! * positions[c + 1]!) -
      positions[a + 1]! * (positions[b]! * positions[c + 2]! - positions[b + 2]! * positions[c]!) +
      positions[a + 2]! * (positions[b]! * positions[c + 1]! - positions[b + 1]! * positions[c]!);
  }
  if (volumeTimesSix === 0) {
    throw new Error('Manifold test subject has zero signed volume');
  }
  if (volumeTimesSix > 0) {
    return [...indices];
  }
  const flipped: number[] = [];
  for (let index = 0; index < indices.length; index += 3) {
    flipped.push(indices[index]!, indices[index + 2]!, indices[index + 1]!);
  }
  return flipped;
};

const modelXml = (zip: Uint8Array<ArrayBuffer>): string => {
  const buffer = Buffer.from(zip);
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04_03_4b_50) {
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const start = offset + 30 + nameLength + buffer.readUInt16LE(offset + 28);
    const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLength);
    const data = buffer.subarray(start, start + compressedSize);
    if (name.endsWith('3D/3dmodel.model')) {
      return (compression === 8 ? inflateRawSync(data) : data).toString('utf8');
    }
    offset = start + compressedSize;
  }
  throw new Error('3MF archive has no model');
};

const integerAttribute = (tag: string, name: string): number | undefined => {
  const value = new RegExp(`\\b${name}="(\\d+)"`, 'u').exec(tag)?.[1];
  return value === undefined ? undefined : Number(value);
};

beforeAll(async () => {
  [fullAssimp, context] = await Promise.all([createAssimp(), definition.initialize({}, runtime)]);
  const objectBytes = new Uint8Array(readFileSync(new URL('fixtures/cube.obj', import.meta.url)));
  const glb = await fullAssimp.convert([{ name: 'cube.obj', bytes: objectBytes }], { to: 'glb' });
  const gltf = await fullAssimp.convert(glb.files, { to: 'gltf' });
  sources = { glb: toExportFiles(glb.files), gltf: toExportFiles(gltf.files) };
}, 120_000);

afterAll(async () => {
  await definition.cleanup?.(context);
  fullAssimp.dispose();
});

describe('assimp transcoder integration', () => {
  it('preserves Manifold-authored vertices through 3MF', async () => {
    const client = createTestRuntimeClient({
      runtime: manifoldRuntime,
      files: {
        'two-material-box.ts': `
          import { Manifold, setMaterial } from 'manifold-3d/manifoldCAD';

          export default function main() {
            const left = setMaterial(Manifold.cube([10, 10, 10]), { baseColorFactor: [1, 0, 0] });
            const right = setMaterial(
              Manifold.cube([10, 10, 10]).translate([10, 0, 0]),
              { baseColorFactor: [0, 0, 1] },
            );
            return left.add(right);
          }
        `,
      },
    });
    const exported = await (async () => {
      try {
        return await client.export('glb', {
          source: { path: 'two-material-box.ts' },
          exportOptions: { coordinateSystem: 'y-up', unit: { length: 'meter' } },
        });
      } finally {
        await client.shutdown();
      }
    })();
    assertSuccess(exported, 'Manifold two-material box');
    const sourceFile = exported.data.find(({ name }) => name.endsWith('.glb'));
    if (sourceFile === undefined) {
      throw new Error('Manifold returned no GLB file');
    }

    const source = sourceFile.bytes;
    const result = await definition.transcode(
      {
        from: 'glb',
        to: '3mf',
        files: [{ name: 'two-material-box.glb', bytes: source, mimeType: 'model/gltf-binary' }],
        options: {},
      },
      runtime,
      context,
    );
    assertSuccess(result, 'Assimp 3MF export');
    const threeMf = result.data.find(({ name }) => name.endsWith('.3mf'));
    if (threeMf === undefined) {
      throw new Error('Assimp returned no 3MF file');
    }

    const topology = await sourceManifoldTopology(source);
    expect(topology.runs).toHaveLength(3);

    const roundTrip = await fullAssimp.convert([{ name: threeMf.name, bytes: threeMf.bytes }], { to: 'assjson' });
    const assjson = roundTrip.files.find(({ name }) => name.endsWith('.json'));
    if (assjson === undefined) {
      throw new Error('3MF re-import returned no assjson file');
    }
    const scene = JSON.parse(new TextDecoder().decode(assjson.bytes)) as {
      meshes?: Array<{ vertices?: number[]; faces?: number[][] }>;
    };
    expect(scene.meshes).toHaveLength(1);
    const mesh = scene.meshes?.[0];
    const actualPositions = mesh?.vertices ?? [];
    const expectedPositions = toThreeMfPositions(topology.positions);
    expect(actualPositions).toHaveLength(expectedPositions.length);
    for (const [index, position] of expectedPositions.entries()) {
      expect(actualPositions[index]).toBeCloseTo(position, 5);
    }
    expect(mesh?.faces?.flat()).toEqual(orientedIndices(toThreeMfPositions(topology.positions), topology.indices));

    const xml = modelXml(threeMf.bytes);
    const objectTags = [...xml.matchAll(/<object\b[^>]*>/gu)].map(([tag]) => tag);
    const triangleTags = [...xml.matchAll(/<triangle\b[^>]*\/>/gu)].map(([tag]) => tag);
    expect(objectTags).toHaveLength(1);
    expect(triangleTags).toHaveLength(topology.indices.length / 3);
    const defaultMaterial = integerAttribute(objectTags[0]!, 'pindex');
    const actualMaterials = triangleTags.map((triangle) => integerAttribute(triangle, 'p1') ?? defaultMaterial);
    const expectedMaterials = topology.runs
      .slice(0, -1)
      .flatMap((start, run) => Array.from({ length: (topology.runs[run + 1]! - start) / 3 }, () => run));
    expect(actualMaterials).toEqual(expectedMaterials);
    expect(await triangleCount(source)).toBe(topology.indices.length / 3);
  }, 120_000);

  it('preserves cube topology through every advertised edge', async () => {
    await Promise.all(
      definition.edges.map(async (edge) => {
        if (edge.from !== 'glb' && edge.from !== 'gltf') {
          throw new Error(`Unexpected Assimp source edge: ${edge.from}`);
        }
        const result = await definition.transcode(
          { from: edge.from, to: edge.to, files: sources[edge.from], options: {} },
          runtime,
          context,
        );
        if (!result.success) {
          throw new Error(`${edge.from} -> ${edge.to}: ${result.issues.map(({ message }) => message).join('; ')}`);
        }

        if (edge.to === 'step') {
          const step = result.data.find(({ name }) => name.endsWith('.step'));
          if (step === undefined) {
            throw new Error(`${edge.from} -> step: no normalized STEP file`);
          }
          const text = new TextDecoder().decode(step.bytes);
          expect(text.startsWith('ISO-10303-21;\nHEADER;'), `${edge.from} -> step header`).toBe(true);
          expect(text.match(/^#\d+=FACE_SURFACE/gmu), `${edge.from} -> step faces`).toHaveLength(12);
          expect(text).toContain('CLOSED_SHELL');
          return;
        }

        let roundTrip: { readonly files: readonly AssimpFile[] };
        try {
          roundTrip =
            edge.to === 'glb'
              ? { files: result.data }
              : await fullAssimp.convert(
                  result.data.map(({ name, bytes }) => ({ name, bytes })),
                  { to: 'glb' },
                );
        } catch (error) {
          throw new Error(`${edge.from} -> ${edge.to}: re-import failed`, { cause: error });
        }
        const glb = roundTrip.files.find(({ name }) => name.endsWith('.glb'));
        if (glb === undefined) {
          throw new Error(`${edge.from} -> ${edge.to}: round trip returned no GLB`);
        }
        const glbBytes = new Uint8Array(glb.bytes);
        validateGlbData(glbBytes);
        expect(await triangleCount(glbBytes), `${edge.from} -> ${edge.to}`).toBe(12);
      }),
    );
  }, 120_000);
});
