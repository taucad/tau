import { describe, expect, it } from 'vitest';
import { clearCollectorGlobals, createCollector, installCollector } from '#runner/collector.js';
import type { GeometrySubject } from '#mesh/types.js';

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
});
