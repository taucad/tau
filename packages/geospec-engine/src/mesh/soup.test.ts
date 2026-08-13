import { describe, expect, it } from 'vitest';
import { triangleSoupPositions } from '#mesh/native.js';
import { buildSoupStats, buildSoupTriangles } from '#mesh/soup.js';

/** Axis-aligned unit tetrahedron-free box: 12 triangles, closed, CCW outward. */
const boxSoup = (originX = 0): number[] => {
  const x0 = originX;
  const x1 = originX + 1;
  const corners: Array<[number, number, number]> = [
    [x0, 0, 0],
    [x1, 0, 0],
    [x1, 1, 0],
    [x0, 1, 0],
    [x0, 0, 1],
    [x1, 0, 1],
    [x1, 1, 1],
    [x0, 1, 1],
  ];
  const faces: Array<[number, number, number]> = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 6],
    [1, 6, 5],
    [2, 3, 7],
    [2, 7, 6],
    [3, 0, 4],
    [3, 4, 7],
  ];
  return faces.flatMap(([a, b, c]) => [...corners[a]!, ...corners[b]!, ...corners[c]!]);
};

describe('triangle-soup mesh evidence', () => {
  it('should flatten triangles in evidence order for native consumers', () => {
    const [triangle] = buildSoupTriangles([0, 0, 0, 3, 0, 0, 0, 3, 0], 1, 'part#0');
    expect([...triangleSoupPositions([triangle!])]).toStrictEqual([0, 0, 0, 3, 0, 0, 0, 3, 0]);
  });

  it('should record each triangle with its centroid and area', () => {
    const triangles = buildSoupTriangles([0, 0, 0, 3, 0, 0, 0, 3, 0], 1, 'part#0');

    expect(triangles).toStrictEqual([
      {
        primitive: 'part#0',
        triangleIndex: 0,
        a: [0, 0, 0],
        b: [3, 0, 0],
        c: [0, 3, 0],
        center: [1, 1, 0],
        area: 4.5,
      },
    ]);
  });

  it('should measure surface area, signed volume and the bounding box of a closed box', () => {
    const stats = buildSoupStats(boxSoup(), 12, 'box#0');

    expect(stats.triangleCount).toBe(12);
    expect(stats.vertexCount).toBe(36);
    expect(stats.meshCount).toBe(1);
    expect(stats.meshQuality.surfaceArea).toBeCloseTo(6, 12);
    expect(stats.meshQuality.signedVolume).toBeCloseTo(1, 12);
    expect(stats.boundingBox).toStrictEqual({
      size: [1, 1, 1],
      center: [0.5, 0.5, 0.5],
      primitives: [{ name: 'box#0', vertices: 36, aabb: { min: [0, 0, 0], max: [1, 1, 1] } }],
    });
  });

  it('should call a closed box watertight and report no irregular edges', () => {
    const stats = buildSoupStats(boxSoup(), 12, 'box#0');

    expect(stats.watertight).toBe(true);
    expect(stats.analyseWatertight()).toMatchObject({
      watertight: true,
      irregularEdges: 0,
      openBoundaryEdges: 0,
      nonManifoldEdges: 0,
      totalEdges: 18,
      irregularEdgeFraction: 0,
    });
  });

  it('should count open boundary and non-manifold edges as irregular', () => {
    const open = buildSoupStats([0, 0, 0, 1, 0, 0, 0, 1, 0], 1, 'sheet#0');
    expect(open.watertight).toBe(false);
    expect(open.analyseWatertight()).toMatchObject({ openBoundaryEdges: 3, nonManifoldEdges: 0, irregularEdges: 3 });

    // Three coplanar fans over one shared edge: that edge has incidence 3.
    const fan = buildSoupStats(
      [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      3,
      'fan#0',
    );
    expect(fan.analyseWatertight().nonManifoldEdges).toBe(1);
  });

  it('should flag degenerate triangles, non-finite vertices and duplicate faces', () => {
    const stats = buildSoupStats(
      [0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, Number.NaN, 0, 0, 1, 0, 0, 0, 1, 0],
      3,
      'bad#0',
    );

    expect(stats.meshQuality.degenerateTriangles).toHaveLength(2);
    expect(stats.meshQuality.nonFiniteVertices).toStrictEqual([
      { primitive: 'bad#0', vertexIndex: 6, position: [Number.NaN, 0, 0] },
    ]);
    expect(stats.meshQuality.duplicateFaces).toStrictEqual([
      { primitive: 'bad#0', triangleIndex: 1, firstTriangleIndex: 0 },
    ]);
  });

  it('should partition disjoint boxes into clusters and merge them at a loose tolerance', () => {
    const stats = buildSoupStats([...boxSoup(0), ...boxSoup(5)], 24, 'pair#0');

    expect(stats.connectedComponents(0.1)).toBe(2);
    const tight = stats.analyseConnectedComponents(0.1);
    expect(tight.clusters).toHaveLength(2);
    expect(tight.clusters[0]?.totalVertices).toBe(36);
    expect(tight.gaps).toStrictEqual([
      { fromLabel: 'pair#0', toLabel: 'pair#0', axis: 'x', gapMm: 4, fromPrimitive: 'pair#0', toPrimitive: 'pair#0' },
    ]);
    // Memoized per tolerance, and a tolerance wider than the gap merges them.
    expect(stats.analyseConnectedComponents(0.1)).toBe(tight);
    expect(stats.connectedComponents(5)).toBe(1);
  });

  it('should chain-merge a run of clusters without double-unioning them', () => {
    const stats = buildSoupStats([...boxSoup(0), ...boxSoup(5), ...boxSoup(10)], 36, 'row#0');

    expect(stats.connectedComponents(0.1)).toBe(3);
    expect(stats.connectedComponents(5)).toBe(1);
    // Wide enough that every pair overlaps: the third pair is already unioned.
    expect(stats.connectedComponents(10)).toBe(1);
  });

  it('should describe an empty soup without inventing geometry', () => {
    const stats = buildSoupStats(new Float64Array(0), 0, '');

    expect(stats).toMatchObject({ vertexCount: 0, meshCount: 0, triangleCount: 0, watertight: true });
    expect(stats.boundingBox).toStrictEqual({ size: [0, 0, 0], center: [0, 0, 0], primitives: [] });
    expect(stats.analyseConnectedComponents(1)).toStrictEqual({ count: 0, clusters: [], gaps: [] });
  });
});
