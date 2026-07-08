import { describe, expect, it } from 'vitest';
import { inspectGeometry } from '#inspection/index.js';
import type { GeometrySubject, MeshTriangle, Vec3 } from '#mesh/types.js';

const boxPositions = [
  0, 0, 0, 10, 20, 0, 10, 0, 0, 0, 0, 0, 0, 20, 0, 10, 20, 0, 0, 0, 30, 10, 0, 30, 10, 20, 30, 0, 0, 30, 10, 20, 30, 0,
  20, 30, 0, 0, 0, 10, 0, 0, 10, 0, 30, 0, 0, 0, 10, 0, 30, 0, 0, 30, 0, 20, 0, 10, 20, 30, 10, 20, 0, 0, 20, 0, 0, 20,
  30, 10, 20, 30, 0, 0, 0, 0, 0, 30, 0, 20, 30, 0, 0, 0, 0, 20, 30, 0, 20, 0, 10, 0, 0, 10, 20, 0, 10, 20, 30, 10, 0, 0,
  10, 20, 30, 10, 0, 30,
];

const center = (a: Vec3, b: Vec3, c: Vec3): [number, number, number] => [
  (a[0] + b[0] + c[0]) / 3,
  (a[1] + b[1] + c[1]) / 3,
  (a[2] + b[2] + c[2]) / 3,
];

const trianglesFromFlat = (primitive: string, values: readonly number[]): MeshTriangle[] => {
  const triangles: MeshTriangle[] = [];
  for (let offset = 0; offset + 8 < values.length; offset += 9) {
    const a: [number, number, number] = [values[offset]!, values[offset + 1]!, values[offset + 2]!];
    const b: [number, number, number] = [values[offset + 3]!, values[offset + 4]!, values[offset + 5]!];
    const c: [number, number, number] = [values[offset + 6]!, values[offset + 7]!, values[offset + 8]!];
    triangles.push({ primitive, triangleIndex: triangles.length, a, b, c, center: center(a, b, c), area: 1 });
  }
  return triangles;
};

const subjectFromTriangles = (triangles: MeshTriangle[]): GeometrySubject =>
  ({
    kind: 'geometry-subject',
    mesh: {
      format: 'mesh-buffer',
      stats: {
        vertexCount: triangles.length * 3,
        meshCount: 1,
        triangleCount: triangles.length,
        connectedComponents: () => 1,
        analyseConnectedComponents: () => ({ count: 1, clusters: [], gaps: [] }),
        watertight: true,
        analyseWatertight: () => ({
          watertight: true,
          irregularEdges: 0,
          openBoundaryEdges: 0,
          nonManifoldEdges: 0,
          irregularEdgeKindCounts: { openBoundary: 0, nonManifold: 0 },
          irregularEdgeClusters: [],
          totalEdges: 0,
          irregularEdgeFraction: 0,
          perPrimitive: [],
        }),
        meshQuality: {
          triangleCount: triangles.length,
          nonFiniteVertices: [],
          degenerateTriangles: [],
          duplicateFaces: [],
          triangles,
          surfaceArea: triangles.length,
          signedVolume: 1,
          centerOfMass: [0, 0, 0],
        },
      },
    },
    provenance: { source: { kind: 'mesh-buffer', format: 'mesh-buffer', name: 'a' }, unit: 'mm', loader: 'in-memory' },
    capabilities: [],
    diagnostics: [],
  }) as unknown as GeometrySubject;

describe('inspectGeometry unmatched diagnostics', () => {
  it('should report the original selector index for each unmatched selector', () => {
    const subject = subjectFromTriangles(trianglesFromFlat('match#0', boxPositions));

    // Selectors 0 and 2 miss; selector 1 matches the sole occurrence.
    const result = inspectGeometry({ subject, selectors: ['no-such-a', /match/u, 'no-such-b'] });

    const indices = result.diagnostics.map(
      (diagnostic) => (diagnostic.details as { selectorIndex?: number } | undefined)?.selectorIndex,
    );
    const messages = result.diagnostics.map((diagnostic) => diagnostic.message);

    // The bug reports post-filter indices [0, 1]; the fix reports the real [0, 2].
    expect(indices).toEqual([0, 2]);
    expect(messages).toEqual(['Geometry selector 0 matched no entities.', 'Geometry selector 2 matched no entities.']);
  });
});
