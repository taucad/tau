import { Accessor, Document, WebIO } from '@gltf-transform/core';
import { afterEach, describe, expect, it } from 'vitest';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import { meshRecordSnapshotCodec } from '#mesh/analysis-record.js';
import { analyzeGlb } from '#mesh/analyze-glb.js';
import type { GeometryStats } from '#mesh/types.js';

const createTwoTriangleGlb = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor()
    .setBuffer(buffer)
    .setType(Accessor.Type['VEC3']!)
    .setArray(new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 5, 10, 0, 5, 0, 10, 5]));
  const indices = document
    .createAccessor()
    .setBuffer(buffer)
    .setType(Accessor.Type['SCALAR']!)
    .setArray(new Uint16Array([0, 1, 2, 3, 4, 5]));
  const primitive = document.createPrimitive().setAttribute('POSITION', positions).setIndices(indices);
  const mesh = document.createMesh('plate').addPrimitive(primitive);
  document.createScene().addChild(document.createNode('plate').setMesh(mesh));
  return new WebIO().writeBinary(document);
};

const observables = (stats: GeometryStats) => ({
  boundingBox: stats.boundingBox,
  triangleCount: stats.meshQuality.triangleCount,
  surfaceArea: stats.meshQuality.surfaceArea,
  signedVolume: stats.meshQuality.signedVolume,
  watertight: stats.analyseWatertight(),
  components: stats.analyseConnectedComponents(0.1).count,
});

describe('mesh-record evidence family (R3)', () => {
  afterEach(() => {
    setGeoSpecEvidenceStore(undefined);
  });

  it('should persist the record snapshot and rehydrate identical observables', async () => {
    const glb = await createTwoTriangleGlb();
    setGeoSpecEvidenceStore(undefined);
    const direct = observables(await analyzeGlb(glb));

    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    const cold = observables(await analyzeGlb(glb));
    expect([...store.entries.keys()].some((key) => key.startsWith('mesh-record:'))).toBe(true);
    const warm = observables(await analyzeGlb(glb));

    expect(cold).toEqual(direct);
    expect(warm).toEqual(direct);
  });

  it('should serve the warm run from the stored snapshot instead of re-parsing', async () => {
    const glb = await createTwoTriangleGlb();
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    await analyzeGlb(glb);

    // Read-through proof: replace the stored snapshot with a distinguishable
    // valid payload — a warm run that re-parsed the GLB could never see it.
    const entryKey = [...store.entries.keys()].find((key) => key.startsWith('mesh-record:'))!;
    expect(entryKey).toBeDefined();
    const marker = meshRecordSnapshotCodec.encode({
      vertexCount: 0,
      meshCount: 0,
      positions: new Float64Array(0),
      triangleIndices: new Uint32Array(0),
      trianglePrimitiveIndices: new Uint32Array(0),
      primitives: [],
      quality: {
        triangleCount: 0,
        nonFiniteVertices: [],
        degenerateTriangles: [],
        duplicateFaces: [],
        surfaceArea: 12_345,
        signedVolume: 0,
      },
    });
    store.entries.set(entryKey, marker);

    const warm = await analyzeGlb(glb);
    expect(warm.meshQuality.surfaceArea).toBe(12_345);
  });
});
