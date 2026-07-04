import { describe, expect, it } from 'vitest';
import { clearCollectorGlobals, createCollector, installCollector } from '#runner/collector.js';
import type {
  AabbMeters,
  BrepEvidence,
  GeometrySubject,
  MeshQualityStats,
  MeshTriangle,
  Vec3,
  WatertightResult,
} from '#mesh/types.js';

type TestSubjectOptions = {
  triangles?: MeshTriangle[];
  meshQuality?: Partial<MeshQualityStats>;
  watertight?: WatertightResult;
  brep?: BrepEvidence;
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

const center = (a: Vec3, b: Vec3, c: Vec3): [number, number, number] => [
  (a[0] + b[0] + c[0]) / 3,
  (a[1] + b[1] + c[1]) / 3,
  (a[2] + b[2] + c[2]) / 3,
];

const triangleArea = (a: Vec3, b: Vec3, c: Vec3): number => {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]) / 2;
};

const triangleFromBounds = (options: {
  primitive: string;
  bounds: AabbMeters;
  triangleIndex: number;
}): MeshTriangle => {
  const { bounds, primitive, triangleIndex } = options;
  const a: [number, number, number] = [bounds.min[0], bounds.min[1], bounds.min[2]];
  const b: [number, number, number] = [bounds.max[0], bounds.min[1], bounds.min[2]];
  const c: [number, number, number] = [bounds.min[0], bounds.max[1], bounds.max[2]];
  return {
    primitive,
    triangleIndex,
    a,
    b,
    c,
    center: center(a, b, c),
    area: triangleArea(a, b, c),
  };
};

const assemblyTriangles = (): MeshTriangle[] => [
  triangleFromBounds({
    primitive: 'left-block#0',
    triangleIndex: 0,
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
  }),
  triangleFromBounds({
    primitive: 'right-block#0',
    triangleIndex: 1,
    bounds: { min: [1, 0, 0], max: [2, 1, 1] },
  }),
  triangleFromBounds({
    primitive: 'far-block#0',
    triangleIndex: 2,
    bounds: { min: [4, 0, 0], max: [5, 1, 1] },
  }),
];

const createSubject = (options: TestSubjectOptions = {}): GeometrySubject => {
  const triangles = options.triangles ?? assemblyTriangles();
  const meshQuality: MeshQualityStats = {
    triangleCount: triangles.length,
    nonFiniteVertices: [],
    degenerateTriangles: [],
    duplicateFaces: [],
    triangles,
    surfaceArea: triangles.reduce((sum, triangle) => sum + triangle.area, 0),
    signedVolume: 0,
    centerOfMass: [0, 0, 0],
    ...options.meshQuality,
  };
  const watertight = options.watertight ?? defaultWatertightResult();
  return {
    kind: 'geometry-subject',
    mesh: {
      format: 'mesh-buffer',
      stats: {
        vertexCount: triangles.length * 3,
        meshCount: new Set(triangles.map((triangle) => triangle.primitive)).size,
        triangleCount: triangles.length,
        meshQuality,
        connectedComponents: () => triangles.length,
        analyseConnectedComponents: () => ({ count: triangles.length, clusters: [], gaps: [] }),
        watertight: watertight.watertight,
        analyseWatertight: () => watertight,
      },
    },
    ...(options.brep ? { brep: options.brep } : {}),
    provenance: {
      source: { kind: 'mesh-buffer', format: 'mesh-buffer', name: 'production-matcher-fixture' },
      unit: 'mm',
      loader: 'in-memory',
    },
    capabilities: [
      { kind: 'mesh', feature: 'triangles' },
      { kind: 'mesh', feature: 'component-overlap' },
      { kind: 'mesh', feature: 'watertightness' },
    ],
    diagnostics: [],
  };
};

const runOneAssertion = async (callback: (collector: ReturnType<typeof createCollector>) => void | Promise<void>) => {
  const collector = createCollector();
  installCollector(collector);
  try {
    collector.it('should evaluate production matcher', async () => callback(collector));
    await collector.waitForCompletion(10_000);
    return collector.tests[0];
  } finally {
    clearCollectorGlobals();
  }
};

describe('production matcher primitives', () => {
  it('should validate assembly occurrence counts and bounds with structured diagnostics', async () => {
    const passing = await runOneAssertion((collector) => {
      collector.expectGeo(createSubject()).toHaveAssemblyOccurrences({
        uniqueNames: true,
        occurrences: [
          { name: /^(?:right|far)-block#0$/, count: 2 },
          {
            name: 'left-block#0',
            bounds: { center: { x: 0.5, y: 0.5, z: 0.5 }, tolerance: 0.001 },
          },
        ],
      });
    });

    expect(passing?.status).toBe('passed');
    expect(passing?.assertions[0]?.kind).toBe('assemblyOccurrences');

    const failing = await runOneAssertion((collector) => {
      collector.expectGeo(createSubject()).toHaveAssemblyOccurrences({
        occurrences: [{ name: /missing/, count: 1 }],
      });
    });

    expect(failing?.status).toBe('failed');
    expect(failing?.assertions[0]?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'GEOSPEC_SELECTOR_UNMATCHED',
          severity: 'error',
        }),
        expect.objectContaining({
          code: 'ASSEMBLY_OCCURRENCES_MISMATCH',
          severity: 'error',
        }),
      ]),
    );
    expect(failing?.assertions[0]?.diagnostics?.map((diagnostic) => diagnostic.message).join('\n')).toContain(
      'occurrences[0].count',
    );
  });

  it('should fail the whole spatial-relationship matcher once for mesh-only subjects (D5 precondition)', async () => {
    // Mesh-only subjects carried AABB-decided relationship verdicts before
    // SB4; the honest contract fails the whole matcher with one
    // unsupported-evidence diagnostic naming the D5 precondition instead of
    // per-relationship results.
    const meshOnly = await runOneAssertion((collector) => {
      collector.expectGeo(createSubject()).toHaveSpatialRelationships({
        relationships: [
          {
            id: 'adjacent blocks touch',
            kind: 'contact',
            subject: 'left-block#0',
            target: 'right-block#0',
            tolerance: 0.001,
          },
          {
            id: 'far block clearance',
            kind: 'clearance',
            subject: 'right-block#0',
            target: 'far-block#0',
            min: 1.9,
            max: 2.1,
          },
          {
            id: 'shaft axes align',
            kind: 'coaxial',
            subject: { kind: 'axis', axis: 'x', center: [0, 0, 0] },
            target: { kind: 'axis', direction: [1, 0, 0], center: [0, 0, 0] },
            tolerance: 0.001,
            angularToleranceDegrees: 0.001,
          },
        ],
      });
    });

    expect(meshOnly?.status).toBe('failed');
    expect(meshOnly?.assertions[0]?.kind).toBe('spatialRelationships');
    expect(meshOnly?.assertions[0]?.diagnostics).toHaveLength(1);
    expect(meshOnly?.assertions[0]?.diagnostics?.[0]).toMatchObject({
      code: 'GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE',
      severity: 'error',
    });
    expect(meshOnly?.assertions[0]?.diagnostics?.[0]?.message).toContain('D5 matcher precondition');
    expect(meshOnly?.assertions[0]?.diagnostics?.[0]?.message).toContain('BRep-kernel subject');
  });

  it('should validate mesh integrity and report invalid tessellation evidence', async () => {
    const clean = await runOneAssertion((collector) => {
      collector.expectGeo(createSubject()).toHaveMeshIntegrity({
        finitePositions: true,
        degenerateTriangles: { count: 0 },
        duplicateFaces: { count: 0 },
        watertight: true,
        triangleCount: { greaterThan: 0 },
      });
    });

    expect(clean?.status).toBe('passed');

    const degenerateTriangle: MeshTriangle = {
      primitive: 'bad#0',
      triangleIndex: 0,
      a: [0, 0, 0],
      b: [0, 0, 0],
      c: [1, 0, 0],
      center: [1 / 3, 0, 0],
      area: 0,
    };
    const failing = await runOneAssertion((collector) => {
      collector
        .expectGeo(
          createSubject({
            triangles: [degenerateTriangle],
            meshQuality: {
              degenerateTriangles: [{ primitive: 'bad#0', triangleIndex: 0, area: 0, center: [1 / 3, 0, 0] }],
            },
          }),
        )
        .toHaveMeshIntegrity({ degenerateTriangles: { count: 0 } });
    });

    expect(failing?.status).toBe('failed');
    expect(failing?.assertions[0]?.diagnostics).toMatchObject([
      {
        code: 'MESH_INTEGRITY_MISMATCH',
        severity: 'error',
      },
    ]);
    expect(failing?.assertions[0]?.diagnostics?.[0]?.message).toContain('degenerateTriangles');
  });

  it('should validate exact BRep evidence with optional production facets', async () => {
    const validBrep = await runOneAssertion((collector) => {
      collector
        .expectGeo(
          createSubject({
            brep: {
              validity: {
                valid: true,
                maxTolerance: 0.001,
                freeBounds: { count: 0 },
                smallEdges: [],
                sameParameter: true,
                closedShells: true,
                closedWires: true,
              },
            },
          }),
        )
        .toBeValidBrep({
          maxTolerance: 0.01,
          freeBounds: { count: 0 },
          minEdgeLength: 0.1,
          sameParameter: true,
          closedShells: true,
          closedWires: true,
        });
    });

    expect(validBrep?.status).toBe('passed');

    const invalidBrep = await runOneAssertion((collector) => {
      collector
        .expectGeo(
          createSubject({
            brep: {
              validity: {
                valid: true,
                maxTolerance: 0.2,
                freeBounds: { count: 1 },
                smallEdges: [{ length: 0.01, shape: 'edge-1', location: [0, 0, 0] }],
                sameParameter: false,
                closedShells: true,
                closedWires: true,
              },
            },
          }),
        )
        .toBeValidBrep({
          maxTolerance: 0.01,
          freeBounds: { count: 0 },
          minEdgeLength: 0.1,
          sameParameter: true,
        });
    });

    expect(invalidBrep?.status).toBe('failed');
    expect(invalidBrep?.assertions[0]?.diagnostics).toMatchObject([
      {
        code: 'BREP_INVALID',
        severity: 'error',
      },
    ]);
    expect(invalidBrep?.assertions[0]?.diagnostics?.[0]?.message).toContain('maxTolerance');
    expect(invalidBrep?.assertions[0]?.diagnostics?.[0]?.message).toContain('sameParameter');
  });
});
