import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { picogkArtifactToGlb } from '#picogk-mesh.js';
import { picogkBuildSchema, picogkOccurrenceSchema, picogkProtocolVersion } from '#picogk.protocol.js';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const fixture = (count = 2) => {
  const bytes = new Uint8Array(80);
  new Float32Array(bytes.buffer, 0, 9).set([0, 0, 0, 1000, 0, 0, 0, 1000, 0]);
  new Float32Array(bytes.buffer, 36, 9).set([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  new Uint16Array(bytes.buffer, 72, 3).set([0, 1, 2]);
  const result = {
    artifactPath: '/private/model.tau-mesh',
    byteLength: 80,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    prototypes: [
      {
        id: 'prototype:1',
        kind: 'triangles',
        positionOffset: 0,
        positionCount: 9,
        normalOffset: 36,
        normalCount: 9,
        indexOffset: 72,
        indexCount: 3,
        indexComponentType: 5123,
      },
    ],
    occurrences: Array.from({ length: count }, (_, i) => ({
      id: `component:picogk-${i + 1}`,
      prototypeId: 'prototype:1',
      name: `Bolt/${i}`,
      matrix: [...identity.slice(0, 12), i * 1000, 2000, 3000, 1],
      color: [1, 0, 0, 1],
      metallic: 0,
      roughness: 1,
    })),
    recycleAfterResponse: false,
    timings: {
      compileCacheHit: false,
      sourceRead: 0,
      parse: 0,
      analyze: 0,
      emit: 0,
      libraryInitialize: 0,
      entryPointInvoke: 0,
      meshConstruction: 0,
      meshExtraction: 0,
      normalGeneration: 0,
      artifactWrite: 0,
      unload: 0,
    },
    metrics: {
      managedHeapBytes: 0,
      picoGkNativeBytes: 0,
      processWorkingSetBytes: 0,
    },
  };
  return { bytes, result: picogkBuildSchema.parse(result) };
};
const gltf = (bytes: Uint8Array<ArrayBuffer>) =>
  JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + new DataView(bytes.buffer).getUint32(12, true)))) as {
    nodes: Array<{ mesh: number; matrix: number[] }>;
    meshes: unknown[];
    accessors: Array<{ componentType: number }>;
  };

describe('private scene v8', () => {
  it('shares one geometry/mesh and preserves 1000 occurrence placements', () => {
    const { bytes, result } = fixture(1000);
    const output = picogkArtifactToGlb(bytes, result);
    const document = gltf(output);
    expect(document.meshes).toHaveLength(1);
    expect(document.nodes).toHaveLength(1000);
    expect(document.accessors).toHaveLength(3);
    expect(document.nodes[999]!.matrix.slice(12, 15)).toEqual([999, 3, -2]);
    expect(document.accessors[2]!.componentType).toBe(5123);
    expect(bytes.byteLength).toBe(80);
  });
  it('rejects corrupted bytes, duplicate identities, unknown references and overlapping ranges', () => {
    const { bytes, result } = fixture();
    expect(() => picogkArtifactToGlb(bytes.subarray(1), result)).toThrow('byte length');
    const broken = new Uint8Array(bytes);
    broken[0] = 1;
    expect(() => picogkArtifactToGlb(broken, result)).toThrow('SHA-256');
    expect(() =>
      picogkArtifactToGlb(bytes, {
        ...result,
        prototypes: [...result.prototypes, ...result.prototypes],
      }),
    ).toThrow('Duplicate');
    expect(() =>
      picogkArtifactToGlb(bytes, {
        ...result,
        occurrences: result.occurrences.map((o) => ({
          ...o,
          prototypeId: 'prototype:2',
        })),
      }),
    ).toThrow('Unknown');
    expect(() =>
      picogkArtifactToGlb(bytes, {
        ...result,
        prototypes: result.prototypes.map((p) => ({ ...p, normalOffset: 0 })),
      }),
    ).toThrow('overlapping');
    expect(() =>
      picogkArtifactToGlb(bytes, {
        ...result,
        occurrences: [result.occurrences[0]!, result.occurrences[0]!],
      }),
    ).toThrow();
  });
  it('rejects primitive restart and malformed spatial values', () => {
    const { bytes, result } = fixture();
    new Uint16Array(bytes.buffer, 72, 3)[2] = 65_535;
    result.sha256 = createHash('sha256').update(bytes).digest('hex');
    expect(() => picogkArtifactToGlb(bytes, result)).toThrow('invalid mesh');
    expect(
      picogkOccurrenceSchema.safeParse({
        ...result.occurrences[0],
        matrix: [...identity.slice(0, 15), 0],
      }).success,
    ).toBe(false);
    expect(
      picogkOccurrenceSchema.safeParse({
        ...result.occurrences[0],
        matrix: [Infinity, ...identity.slice(1)],
      }).success,
    ).toBe(false);
    expect(
      picogkOccurrenceSchema.safeParse({
        ...result.occurrences[0],
        id: 'component:picogk-0',
      }).success,
    ).toBe(false);
    expect(picogkProtocolVersion).toBe(8);
  });
  it('rejects unused prototypes, legacy descriptors, malformed counters and missing counts', () => {
    const { result } = fixture();
    expect(picogkBuildSchema.safeParse({ ...result, occurrences: [] }).success).toBe(false);
    expect(picogkBuildSchema.safeParse({ ...result, components: [] }).success).toBe(false);
    expect(
      picogkBuildSchema.safeParse({
        ...result,
        prototypes: result.prototypes.map((p) => ({
          ...p,
          positionCount: undefined,
        })),
      }).success,
    ).toBe(false);
    expect(
      picogkBuildSchema.safeParse({
        ...result,
        workCounters: { capturedSnapshots: 1 },
      }).success,
    ).toBe(false);
    expect(
      picogkBuildSchema.safeParse({
        ...result,
        workCounters: {
          capturedSnapshots: 1,
          geometryReadbacks: 1,
          inputVertices: 3,
          inputIndices: 3,
          normalLayouts: 1,
          uvLayouts: 0,
          materialProjections: 0,
          memoryBytes: 0,
        },
      }).success,
    ).toBe(false);
  });
  it('conjugates rigid orientation and splits material bindings while sharing attribute bytes', () => {
    const { bytes, result } = fixture();
    result.occurrences[0]!.matrix = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    result.occurrences[1]!.color = [0, 1, 0, 1];
    const document = gltf(picogkArtifactToGlb(bytes, result));
    expect(document.nodes[0]!.matrix).toEqual([0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1]);
    expect(document.meshes).toHaveLength(2);
    expect(document.accessors).toHaveLength(3);
  });
});
