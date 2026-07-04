import { Accessor, Document } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import {
  buildMeshAnalysisRecord,
  collectConnectedPiecePrimitiveRecordsFromRecord,
  createGeometryStatsFromRecord,
} from '#mesh/analysis-record.js';

const createTriangleDocument = (options: {
  name: string;
  positions: readonly number[];
  indices?: readonly number[];
}): Document => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positionAccessor = document
    .createAccessor()
    .setType(Accessor.Type['VEC3']!)
    .setBuffer(buffer)
    .setArray(new Float32Array(options.positions));
  const primitive = document.createPrimitive().setMode(4).setAttribute('POSITION', positionAccessor);
  if (options.indices) {
    primitive.setIndices(
      document
        .createAccessor()
        .setType(Accessor.Type['SCALAR']!)
        .setBuffer(buffer)
        .setArray(new Uint32Array(options.indices)),
    );
  }
  const mesh = document.createMesh(options.name).addPrimitive(primitive);
  document.createScene().addChild(document.createNode(options.name).setMesh(mesh));
  return document;
};

const createNamedAssemblyDocument = (
  parts: ReadonlyArray<{
    name: string;
    positions: readonly number[];
    color: readonly [number, number, number, number];
  }>,
): Document => {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene();
  for (const part of parts) {
    const material = document
      .createMaterial(`${part.name}-material`)
      .setBaseColorFactor([part.color[0], part.color[1], part.color[2], part.color[3]]);
    const positionAccessor = document
      .createAccessor()
      .setType(Accessor.Type['VEC3']!)
      .setBuffer(buffer)
      .setArray(new Float32Array(part.positions));
    const primitive = document
      .createPrimitive()
      .setMode(4)
      .setAttribute('POSITION', positionAccessor)
      .setMaterial(material);
    const mesh = document.createMesh(part.name).addPrimitive(primitive);
    scene.addChild(document.createNode(part.name).setMesh(mesh));
  }
  return document;
};

const tetrahedronFaceIndices = [
  [0, 2, 1],
  [0, 1, 3],
  [0, 3, 2],
  [1, 2, 3],
] as const;

const appendTetrahedron = (
  positions: number[],
  indices: number[],
  vertices: ReadonlyArray<[number, number, number]>,
): void => {
  const base = positions.length / 3;
  for (const vertex of vertices) {
    positions.push(vertex[0], vertex[1], vertex[2]);
  }
  for (const face of tetrahedronFaceIndices) {
    indices.push(base + face[0], base + face[1], base + face[2]);
  }
};

const createLowFractionNonManifoldDocument = (): Document => {
  const positions: number[] = [];
  const indices: number[] = [];

  positions.push(0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1);
  indices.push(0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3, 0, 1, 4, 0, 5, 1, 0, 4, 5, 1, 5, 4);

  for (let index = 0; index < 100; index++) {
    const x = 10 + index * 3;
    appendTetrahedron(positions, indices, [
      [x, 0, 0],
      [x + 1, 0, 0],
      [x, 1, 0],
      [x, 0, 1],
    ]);
  }

  return createTriangleDocument({ name: 'low-fraction-non-manifold', positions, indices });
};

describe('MeshAnalysisRecord', () => {
  it('should produce zero-count geometry stats for an empty glTF document', () => {
    const document = new Document();
    document.createScene();

    const record = buildMeshAnalysisRecord(document);
    const stats = createGeometryStatsFromRecord(record);

    expect(record.vertexCount).toBe(0);
    expect(record.meshCount).toBe(0);
    expect(record.triangleCount).toBe(0);
    expect(record.primitives).toEqual([]);
    expect(record.positions).toHaveLength(0);
    expect(record.triangleIndices).toHaveLength(0);
    expect(stats.vertexCount).toBe(0);
    expect(stats.meshCount).toBe(0);
    expect(stats.triangleCount).toBe(0);
    expect(stats.boundingBox).toBeUndefined();
    expect(stats.meshQuality.triangleCount).toBe(0);
  });

  it('should expose cheap primitive bounding-box records without materializing connected sub-pieces', () => {
    const record = buildMeshAnalysisRecord(
      createTriangleDocument({
        name: 'two-islands',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 11, 0, 0, 10, 1, 0],
        indices: [0, 1, 2, 3, 4, 5],
      }),
    );

    const stats = createGeometryStatsFromRecord(record);

    expect(stats.boundingBox).toMatchObject({
      size: [11, 1, 0],
      center: [5.5, 0.5, 0],
      primitives: [
        {
          name: 'two-islands',
          vertices: 6,
          aabb: { min: [0, 0, 0], max: [11, 1, 0] },
        },
      ],
    });
    expect(collectConnectedPiecePrimitiveRecordsFromRecord(record)).toEqual([
      expect.objectContaining({
        name: 'two-islands#part0',
        vertices: 3,
        aabb: { min: [0, 0, 0], max: [1, 1, 0] },
      }),
      expect.objectContaining({
        name: 'two-islands#part1',
        vertices: 3,
        aabb: { min: [10, 0, 0], max: [11, 1, 0] },
      }),
    ]);
  });

  it('should reuse welded-position evidence for unwelded connected-piece analysis', () => {
    const record = buildMeshAnalysisRecord(
      createTriangleDocument({
        name: 'unwelded-square',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
        indices: [0, 1, 2, 3, 4, 5],
      }),
    );

    expect(record.getWeldedPositions()).toBe(record.getWeldedPositions());
    expect(record.getConnectedPieces()).toEqual([
      expect.objectContaining({
        name: 'unwelded-square',
        vertices: 4,
        triangleIndices: new Uint32Array([0, 1]),
      }),
    ]);
  });

  it('should keep rich watertight diagnostics available through lazy analysis', () => {
    const stats = createGeometryStatsFromRecord(
      buildMeshAnalysisRecord(
        createTriangleDocument({
          name: 'open-triangle',
          positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        }),
      ),
    );

    const watertight = stats.analyseWatertight();
    expect(stats.watertight).toBe(false);
    expect(watertight.watertight).toBe(false);
    expect(watertight.openBoundaryEdges).toBe(3);
    expect(watertight.nonManifoldEdges).toBe(0);
    expect(watertight.irregularEdgeKindCounts).toEqual({ openBoundary: 3, nonManifold: 0 });
    expect(watertight.irregularEdgeClusters[0]).toMatchObject({ kind: 'open-boundary', edgeCount: 3 });
    expect(watertight.perPrimitive[0]).toMatchObject({
      name: 'open-triangle',
      boundaryEdges: 3,
    });
    expect(watertight.perPrimitive[0]?.loopCentroid.every((coordinate) => Number.isFinite(coordinate))).toBe(true);
  });

  it('should fail strict watertightness for low-fraction non-manifold edges with no open boundary', () => {
    const stats = createGeometryStatsFromRecord(buildMeshAnalysisRecord(createLowFractionNonManifoldDocument()));
    const watertight = stats.analyseWatertight();

    expect(watertight.watertight).toBe(false);
    expect(watertight.irregularEdges).toBe(1);
    expect(watertight.openBoundaryEdges).toBe(0);
    expect(watertight.nonManifoldEdges).toBe(1);
    expect(watertight.irregularEdgeFraction).toBeLessThan(0.01);
    expect(watertight.irregularEdgeKindCounts).toEqual({ openBoundary: 0, nonManifold: 1 });
    expect(watertight.irregularEdgeClusters[0]).toMatchObject({
      kind: 'non-manifold',
      edgeCount: 1,
      samples: [expect.objectContaining({ incidentTriangleCount: 4 })],
    });
  });

  it('should build named component partitions from primitive ranges while merging repeated labels', () => {
    const record = buildMeshAnalysisRecord(
      createNamedAssemblyDocument([
        {
          name: 'Bolt',
          positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
          color: [1, 0, 0, 1],
        },
        {
          name: 'Bolt',
          positions: [10, 0, 0, 11, 0, 0, 10, 1, 0],
          color: [1, 0, 0, 1],
        },
        {
          name: 'Bracket',
          positions: [20, 0, 0, 21, 0, 0, 20, 1, 0],
          color: [0, 0, 1, 1],
        },
      ]),
    );

    const partition = record.getComponentPartition();

    expect(partition).toMatchObject({
      source: 'named',
      componentIds: new Int32Array([0, 0, 1]),
      components: [
        {
          id: 0,
          label: 'Bolt',
          color: '#ff0000',
          triangleCount: 2,
          aabb: { min: [0, 0, 0], max: [11, 1, 0] },
        },
        {
          id: 1,
          label: 'Bracket',
          color: '#0000ff',
          triangleCount: 1,
          aabb: { min: [20, 0, 0], max: [21, 1, 0] },
        },
      ],
    });
  });
});
