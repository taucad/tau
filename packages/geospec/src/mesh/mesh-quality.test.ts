import { Accessor, Document } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { analyzeGltfDocument } from '#mesh/analyze-glb.js';

const createDocument = (positionsArray: number[], indicesArray: number[]): Document => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor()
    .setType(Accessor.Type['VEC3']!)
    .setBuffer(buffer)
    .setArray(new Float32Array(positionsArray));
  const indices = document
    .createAccessor()
    .setType(Accessor.Type['SCALAR']!)
    .setBuffer(buffer)
    .setArray(new Uint32Array(indicesArray));
  const primitive = document.createPrimitive().setMode(4).setAttribute('POSITION', positions).setIndices(indices);
  const mesh = document.createMesh('fixture').addPrimitive(primitive);
  document.createScene().addChild(document.createNode('fixture').setMesh(mesh));
  return document;
};

describe('mesh quality metrics', () => {
  it('should identify degenerate and duplicate triangles with spatial context', () => {
    const document = createDocument(
      [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 2, 0, 0, 2, 0, 0],
      [0, 1, 2, 3, 4, 5, 6, 7, 8],
    );

    const stats = analyzeGltfDocument(document);

    expect(stats.triangleCount).toBe(3);
    expect(stats.meshQuality.duplicateFaces).toEqual([
      {
        primitive: 'fixture#0',
        triangleIndex: 1,
        firstTriangleIndex: 0,
      },
    ]);
    expect(stats.meshQuality.degenerateTriangles).toEqual([
      {
        primitive: 'fixture#0',
        triangleIndex: 2,
        area: 0,
        center: [2, 0, 0],
      },
    ]);
    expect(stats.meshQuality.surfaceArea).toBeCloseTo(1);
    expect(stats.meshQuality.triangles).toHaveLength(3);
    expect(stats.meshQuality.triangles[0]).toMatchObject({
      primitive: 'fixture#0',
      triangleIndex: 0,
      center: [1 / 3, 1 / 3, 0],
      area: 0.5,
    });
  });

  it('should report non-finite vertices without relying on kernel metadata', () => {
    const document = createDocument([0, 0, 0, Number.NaN, 0, 0, 0, 1, 0], [0, 1, 2]);

    const stats = analyzeGltfDocument(document);

    expect(stats.meshQuality.nonFiniteVertices).toEqual([
      {
        primitive: 'fixture#0',
        vertexIndex: 1,
        position: [Number.NaN, 0, 0],
      },
    ]);
  });
});
