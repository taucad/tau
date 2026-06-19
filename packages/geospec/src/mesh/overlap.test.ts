import { describe, expect, it } from 'vitest';
import { analyzeMeshOverlap, getMeshOverlapCacheStats } from '#mesh/overlap.js';
import type { GeometryDiagnostic, GeometrySubject, MeshTriangle, Vec3, WatertightResult } from '#mesh/types.js';
import { createGeoSpecResourceScopeProfile } from '#runner/profile.js';
import { createGeoSpecResourceScope } from '#runner/resource-scope.js';

const boxPositions = [
  0, 0, 0, 10, 20, 0, 10, 0, 0, 0, 0, 0, 0, 20, 0, 10, 20, 0, 0, 0, 30, 10, 0, 30, 10, 20, 30, 0, 0, 30, 10, 20, 30, 0,
  20, 30, 0, 0, 0, 10, 0, 0, 10, 0, 30, 0, 0, 0, 10, 0, 30, 0, 0, 30, 0, 20, 0, 10, 20, 30, 10, 20, 0, 0, 20, 0, 0, 20,
  30, 10, 20, 30, 0, 0, 0, 0, 0, 30, 0, 20, 30, 0, 0, 0, 0, 20, 30, 0, 20, 0, 10, 0, 0, 10, 20, 0, 10, 20, 30, 10, 0, 0,
  10, 20, 30, 10, 0, 30,
];

const shiftBox = (x: number): number[] => boxPositions.map((value, index) => (index % 3 === 0 ? value + x : value));

const center = (a: Vec3, b: Vec3, c: Vec3): [number, number, number] => [
  (a[0] + b[0] + c[0]) / 3,
  (a[1] + b[1] + c[1]) / 3,
  (a[2] + b[2] + c[2]) / 3,
];

const triangleArea = (a: Vec3, b: Vec3, c: Vec3): number => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross: [number, number, number] = [
    ab[1]! * ac[2]! - ab[2]! * ac[1]!,
    ab[2]! * ac[0]! - ab[0]! * ac[2]!,
    ab[0]! * ac[1]! - ab[1]! * ac[0]!,
  ];
  return Math.hypot(cross[0], cross[1], cross[2]) / 2;
};

const trianglesFromFlat = (primitive: string, values: readonly number[], startIndex = 0): MeshTriangle[] => {
  const triangles: MeshTriangle[] = [];
  for (let offset = 0; offset + 8 < values.length; offset += 9) {
    const a: [number, number, number] = [values[offset]!, values[offset + 1]!, values[offset + 2]!];
    const b: [number, number, number] = [values[offset + 3]!, values[offset + 4]!, values[offset + 5]!];
    const c: [number, number, number] = [values[offset + 6]!, values[offset + 7]!, values[offset + 8]!];
    triangles.push({
      primitive,
      triangleIndex: startIndex + triangles.length,
      a,
      b,
      c,
      center: center(a, b, c),
      area: triangleArea(a, b, c),
    });
  }
  return triangles;
};

const defaultWatertightResult = (): WatertightResult => ({
  watertight: true,
  irregularEdges: 0,
  openBoundaryEdges: 0,
  nonManifoldEdges: 0,
  irregularEdgeKindCounts: { openBoundary: 0, nonManifold: 0 },
  irregularEdgeClusters: [],
  totalEdges: 0,
  irregularEdgeFraction: 0,
  perPrimitive: [],
});

const subjectFromTriangles = (
  triangles: MeshTriangle[],
  options: { diagnostics?: GeometryDiagnostic[]; watertight?: WatertightResult } = {},
): GeometrySubject => ({
  kind: 'geometry-subject',
  mesh: {
    format: 'mesh-buffer',
    stats: {
      vertexCount: triangles.length * 3,
      meshCount: new Set(triangles.map((triangle) => triangle.primitive)).size,
      triangleCount: triangles.length,
      connectedComponents: () => 1,
      analyseConnectedComponents: () => ({ count: 1, clusters: [], gaps: [] }),
      watertight: true,
      analyseWatertight: () => options.watertight ?? defaultWatertightResult(),
      meshQuality: {
        triangleCount: triangles.length,
        nonFiniteVertices: [],
        degenerateTriangles: [],
        duplicateFaces: [],
        triangles,
        surfaceArea: triangles.reduce((sum, triangle) => sum + triangle.area, 0),
        signedVolume: 1,
        centerOfMass: [0, 0, 0],
      },
    },
  },
  provenance: {
    source: { kind: 'mesh-buffer', format: 'mesh-buffer', name: 'assembly' },
    unit: 'mm',
    loader: 'in-memory',
    parameters: { stage: 'test' },
  },
  capabilities: [{ kind: 'mesh', feature: 'component-overlap' }],
  diagnostics: options.diagnostics ?? [],
});

const twoBoxSubject = (x: number): GeometrySubject =>
  subjectFromTriangles([
    ...trianglesFromFlat('left-box#0', boxPositions),
    ...trianglesFromFlat('right-box#0', shiftBox(x), 12),
  ]);

describe('analyzeMeshOverlap', () => {
  it('should report no overlaps for disjoint manifold components', { timeout: 10_000 }, async () => {
    const result = await analyzeMeshOverlap({ subject: twoBoxSubject(15), tolerance: 0.001 });

    expect(result).toMatchObject({
      success: true,
      evidence: {
        componentSource: 'named',
        componentCount: 2,
        checkedPairs: 0,
        tolerance: 0.001,
        overlaps: [],
      },
    });
  });

  it('should treat tangent manifold contact as non-overlap', { timeout: 10_000 }, async () => {
    const result = await analyzeMeshOverlap({ subject: twoBoxSubject(10), tolerance: 0.001 });

    expect(result).toMatchObject({
      success: true,
      evidence: {
        checkedPairs: 1,
        overlaps: [],
      },
    });
  });

  it('should report exact positive-volume overlap evidence for manifold components', { timeout: 10_000 }, async () => {
    const result = await analyzeMeshOverlap({ subject: twoBoxSubject(9), tolerance: 0.001 });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
    }
    expect(result.evidence).toMatchObject({
      componentSource: 'named',
      componentCount: 2,
      checkedPairs: 1,
      overlaps: [
        {
          leftLabel: 'left-box#0',
          rightLabel: 'right-box#0',
          penetration: 'positive-volume',
        },
      ],
    });
    expect(result.evidence.overlaps[0]?.intersectionVolume).toBeCloseTo(600, 2);
    expect(result.evidence.overlaps[0]?.witnessPoint?.every((coordinate) => Number.isFinite(coordinate))).toBe(true);
  });

  it(
    'should reuse prepared Manifold components and exact pair volumes inside a subject resource scope',
    { timeout: 10_000 },
    async () => {
      const subject = twoBoxSubject(9);
      const profile = createGeoSpecResourceScopeProfile();
      const scope = createGeoSpecResourceScope({ profile });
      scope.trackSubject(subject);

      try {
        const first = await analyzeMeshOverlap({ subject, tolerance: 0.001 });
        expect(first.success).toBe(true);
        expect(getMeshOverlapCacheStats(subject)).toEqual({
          preparedComponents: 2,
          pairVolumes: 1,
          invalidDiagnosticSets: 1,
          disposed: false,
        });

        const second = await analyzeMeshOverlap({ subject, tolerance: 0.5 });
        expect(second.success).toBe(true);
        expect(getMeshOverlapCacheStats(subject)).toEqual({
          preparedComponents: 2,
          pairVolumes: 1,
          invalidDiagnosticSets: 1,
          disposed: false,
        });
      } finally {
        await scope.dispose();
      }

      expect(getMeshOverlapCacheStats(subject)).toBeUndefined();
      expect(profile).toMatchObject({
        trackedSubjects: 1,
        registeredDisposables: 1,
        disposedScopes: 1,
        disposedResources: 1,
        overlap: {
          cacheCreations: 1,
          cacheDisposals: 1,
          preparedComponentHits: 2,
          preparedComponentMisses: 2,
          pairVolumeHits: 1,
          pairVolumeMisses: 1,
          invalidDiagnosticHits: 1,
          invalidDiagnosticMisses: 1,
        },
      });
    },
  );

  it(
    'should dispose overlap backend resources after standalone analysis without a resource scope',
    { timeout: 10_000 },
    async () => {
      const subject = twoBoxSubject(9);

      const result = await analyzeMeshOverlap({ subject, tolerance: 0.001 });

      expect(result.success).toBe(true);
      expect(getMeshOverlapCacheStats(subject)).toBeUndefined();
    },
  );

  it('should report inconclusive diagnostics when component identity is unavailable', async () => {
    const result = await analyzeMeshOverlap({
      subject: subjectFromTriangles(trianglesFromFlat('single#0', boxPositions)),
    });

    expect(result).toMatchObject({
      success: false,
      diagnostics: [
        {
          code: 'GEOSPEC_COMPONENT_PARTITION_INCONCLUSIVE',
          severity: 'error',
          details: {
            primitiveCount: 1,
            source: { kind: 'mesh-buffer', format: 'mesh-buffer', name: 'assembly' },
            parameters: { stage: 'test' },
          },
        },
      ],
    });
  });

  it(
    'should report invalid non-manifold components instead of using an alternate backend',
    { timeout: 10_000 },
    async () => {
      const result = await analyzeMeshOverlap({
        subject: subjectFromTriangles(
          [
            {
              primitive: 'open-left#0',
              triangleIndex: 0,
              a: [0, 0, 0],
              b: [1, 0, 0],
              c: [0, 1, 0],
              center: [1 / 3, 1 / 3, 0],
              area: 0.5,
            },
            {
              primitive: 'open-right#0',
              triangleIndex: 1,
              a: [0, 0, 0],
              b: [0, 1, 0],
              c: [0, 0, 1],
              center: [0, 1 / 3, 1 / 3],
              area: 0.5,
            },
          ],
          {
            diagnostics: [
              {
                code: 'GEOMETRY_INVALID',
                severity: 'warning',
                message: "JSCAD part 'open-left#0' is not a closed oriented solid.",
                details: {
                  facet: {
                    kind: 'source-validity',
                    valid: false,
                    partName: 'open-left#0',
                  },
                  issue: {
                    code: 'GEOMETRY_INVALID',
                    severity: 'warning',
                    message: "JSCAD part 'open-left#0' is not a closed oriented solid.",
                  },
                },
              },
            ],
            watertight: {
              watertight: false,
              irregularEdges: 6,
              openBoundaryEdges: 6,
              totalEdges: 6,
              irregularEdgeFraction: 1,
              perPrimitive: [
                {
                  name: 'open-left#0',
                  boundaryEdges: 3,
                  loopCentroid: [0.5, 0.5, 0],
                },
                {
                  name: 'open-right#0',
                  boundaryEdges: 3,
                  loopCentroid: [0, 0.5, 0.5],
                },
              ],
            },
          },
        ),
      });

      expect(result).toMatchObject({
        success: false,
        diagnostics: [
          {
            code: 'GEOSPEC_MANIFOLD_COMPONENT_INVALID',
            severity: 'error',
            details: {
              label: 'open-left#0',
              triangleCount: 1,
              watertight: {
                global: {
                  watertight: false,
                  irregularEdges: 6,
                  openBoundaryEdges: 6,
                  totalEdges: 6,
                  irregularEdgeFraction: 1,
                },
                primitive: {
                  name: 'open-left#0',
                  boundaryEdges: 3,
                  loopCentroid: [0.5, 0.5, 0],
                },
              },
              sourceDiagnostics: [
                {
                  code: 'GEOMETRY_INVALID',
                  severity: 'warning',
                  message: "JSCAD part 'open-left#0' is not a closed oriented solid.",
                  details: {
                    facet: {
                      kind: 'source-validity',
                      valid: false,
                      partName: 'open-left#0',
                    },
                    issue: {
                      code: 'GEOMETRY_INVALID',
                      severity: 'warning',
                      message: "JSCAD part 'open-left#0' is not a closed oriented solid.",
                    },
                  },
                },
              ],
            },
          },
          {
            code: 'GEOSPEC_MANIFOLD_COMPONENT_INVALID',
            severity: 'error',
            details: {
              label: 'open-right#0',
              triangleCount: 1,
              watertight: {
                primitive: {
                  name: 'open-right#0',
                  boundaryEdges: 3,
                  loopCentroid: [0, 0.5, 0.5],
                },
              },
            },
          },
        ],
      });
    },
  );
});
