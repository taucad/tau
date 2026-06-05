import { describe, expect, it } from 'vitest';
import { clearCollectorGlobals, createCollector, installCollector } from '#runner/collector.js';
import type { GeometrySubject } from '#mesh/types.js';
import type {
  GeoSpecAssertion,
  GeoSpecChamferFeatureExpectation,
  GeoSpecCylindricalFaceExpectation,
  GeoSpecMinimumWallThicknessExpectation,
} from '#runner/types.js';

const createSubject = (withBrep: boolean): GeometrySubject => ({
  kind: 'geometry-subject',
  provenance: {
    source: { kind: 'mesh-buffer', format: 'mesh-buffer', name: 'brep-fixture' },
    unit: 'mm',
    loader: 'in-memory',
  },
  capabilities: withBrep
    ? [
        { kind: 'brep', feature: 'planar-faces' },
        { kind: 'brep', feature: 'cylindrical-faces' },
        { kind: 'brep', feature: 'circular-holes' },
        { kind: 'brep', feature: 'chamfer-features' },
        { kind: 'brep', feature: 'wall-thickness' },
      ]
    : [],
  diagnostics: [],
  mesh: {
    format: 'mesh-buffer',
    stats: {
      vertexCount: 0,
      meshCount: 0,
      triangleCount: 0,
      meshQuality: {
        triangleCount: 0,
        nonFiniteVertices: [],
        degenerateTriangles: [],
        duplicateFaces: [],
        triangles: [],
        surfaceArea: 0,
        signedVolume: 0,
      },
      connectedComponents: () => 0,
      analyseConnectedComponents: () => ({ count: 0, clusters: [], gaps: [] }),
      watertight: false,
      analyseWatertight: () => ({
        watertight: false,
        irregularEdges: 0,
        openBoundaryEdges: 0,
        totalEdges: 0,
        irregularEdgeFraction: 0,
        perPrimitive: [],
      }),
    },
  },
  brep: withBrep
    ? {
        massProperties: {
          surfaceArea: 400,
          volume: 1000,
          centerOfMass: [5, 5, 5],
          mass: 7.85,
        },
        planarFaces: [{ normal: [0, 0, 1], offset: 20, area: 6000 }],
        cylindricalFaces: [{ radius: 15, axis: 'z' }],
        circularHoles: [{ diameter: 8, through: true, axis: 'z', center: [25, 15, 0] }],
        chamferFeatures: [{ distance: 2, selection: 'outer top perimeter' }],
        minimumWallThickness: { value: 2.5, location: [0, 0, 0] },
      }
    : undefined,
});

const getAssertion = (collector: ReturnType<typeof createCollector>, testIndex: number): GeoSpecAssertion => {
  const assertion = collector.tests[testIndex]?.assertions[0];
  expect(assertion).toBeDefined();
  return assertion!;
};

describe('BRep feature matchers', () => {
  it('should validate initial BRep feature evidence', async () => {
    const collector = createCollector();
    installCollector(collector);
    try {
      collector.it('should match brep features', () => {
        const model = createSubject(true);
        collector.expectGeo(model).toHavePlanarFace({
          normal: { x: 0, y: 0, z: 1 },
          offset: 20,
          area: { greaterThan: 5000 },
          tolerance: 0.05,
        });
        collector.expectGeo(model).toHaveCylindricalFace({ radius: 15, axis: 'z', tolerance: 0.05 });
        collector.expectGeo(model).toHaveCircularHole({
          diameter: 8,
          through: true,
          axis: 'z',
          center: { x: 25, y: 15 },
          tolerance: 0.05,
        });
        collector.expectGeo(model).toHaveChamferFeature({
          distance: 2,
          selection: 'outer top perimeter',
          tolerance: 0.05,
        });
        collector.expectGeo(model).toHaveMinimumWallThickness({
          value: { greaterThanOrEqual: 2 },
          tolerance: 0.05,
        });
      });
      await collector.waitForCompletion(1000);

      expect(collector.tests[0]?.status).toBe('passed');
      expect(collector.tests[0]?.assertions.map((assertion) => assertion.kind)).toEqual([
        'planarFace',
        'cylindricalFace',
        'circularHole',
        'chamferFeature',
        'minimumWallThickness',
      ]);
    } finally {
      clearCollectorGlobals();
    }
  });

  it('should report unsupported evidence for BRep matchers on mesh-only subjects', async () => {
    const collector = createCollector();
    installCollector(collector);
    try {
      collector.it('should reject mesh-only feature checks', () => {
        collector.expectGeo(createSubject(false)).toHavePlanarFace({
          normal: { x: 0, y: 0, z: 1 },
          offset: 20,
        });
      });
      await collector.waitForCompletion(1000);

      expect(collector.tests[0]?.status).toBe('failed');
      expect(collector.tests[0]?.assertions[0]?.diagnostics).toMatchObject([
        {
          code: 'UNSUPPORTED_GEOMETRY_EVIDENCE',
          severity: 'error',
        },
      ]);
    } finally {
      clearCollectorGlobals();
    }
  });

  it('should include candidate features and subject context in BRep mismatch diagnostics', async () => {
    const collector = createCollector();
    installCollector(collector);
    try {
      collector.it('should report the checked BRep evidence', () => {
        collector.expectGeo(createSubject(true)).toHaveCylindricalFace({
          radius: 99,
          axis: 'z',
          tolerance: 0.05,
        });
      });
      await collector.waitForCompletion(1000);

      expect(collector.tests[0]?.status).toBe('failed');
      const diagnostic = getAssertion(collector, 0).diagnostics?.[0];
      expect(diagnostic).toBeDefined();
      expect(diagnostic).toMatchObject({
        code: 'CYLINDRICAL_FACE_NOT_FOUND',
        details: {
          evidence: 'brep',
          unit: 'mm',
          source: { kind: 'mesh-buffer', format: 'mesh-buffer', name: 'brep-fixture' },
          actual: [{ radius: 15, axis: 'z' }],
        },
      });
    } finally {
      clearCollectorGlobals();
    }
  });

  it('should report invalid expectation diagnostics for malformed BRep matcher input', async () => {
    const collector = createCollector();
    installCollector(collector);
    try {
      collector.it('should reject malformed wall-thickness checks', () => {
        collector.expectGeo(createSubject(true)).toHaveMinimumWallThickness({
          value: { atLeast: 2 },
          tolerance: 0.05,
        } as unknown as GeoSpecMinimumWallThicknessExpectation);
      });
      collector.it('should reject unknown cylindrical-face fields', () => {
        collector.expectGeo(createSubject(true)).toHaveCylindricalFace({
          radius: 15,
          axis: 'z',
          tolerance: 0.05,
          expectedCount: 1,
        } as unknown as GeoSpecCylindricalFaceExpectation);
      });
      collector.it('should reject malformed chamfer-feature distance', () => {
        collector.expectGeo(createSubject(true)).toHaveChamferFeature({
          distance: { greaterThanOrEqual: 2 },
          tolerance: 0.05,
        } as unknown as GeoSpecChamferFeatureExpectation);
      });
      await collector.waitForCompletion(1000);

      expect(collector.tests.map((test) => test.status)).toEqual(['failed', 'failed', 'failed']);
      const wallThicknessAssertion = getAssertion(collector, 0);
      expect(wallThicknessAssertion.kind).toBe('minimumWallThickness');
      expect(wallThicknessAssertion.passed).toBe(false);
      expect(
        (wallThicknessAssertion.diagnostics ?? []).find(
          (diagnostic) => diagnostic.code === 'GEOSPEC_INVALID_EXPECTATION',
        ),
      ).toMatchObject({
        details: { field: 'value' },
      });

      const cylindricalFaceAssertion = getAssertion(collector, 1);
      expect(cylindricalFaceAssertion.kind).toBe('cylindricalFace');
      expect(cylindricalFaceAssertion.passed).toBe(false);
      expect(
        (cylindricalFaceAssertion.diagnostics ?? []).find(
          (diagnostic) => diagnostic.code === 'GEOSPEC_INVALID_EXPECTATION',
        ),
      ).toMatchObject({
        details: { field: 'expectedCount' },
      });

      const chamferFeatureAssertion = getAssertion(collector, 2);
      expect(chamferFeatureAssertion.kind).toBe('chamferFeature');
      expect(chamferFeatureAssertion.passed).toBe(false);
      expect(
        (chamferFeatureAssertion.diagnostics ?? []).find(
          (diagnostic) => diagnostic.code === 'GEOSPEC_INVALID_EXPECTATION',
        ),
      ).toMatchObject({
        details: { field: 'distance', matcher: 'toHaveChamferFeature' },
      });
    } finally {
      clearCollectorGlobals();
    }
  });
});
