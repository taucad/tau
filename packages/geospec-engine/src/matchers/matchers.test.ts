import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadStep } from '#step/index.js';
import { geoSpecMatcherDescriptors } from 'geospec/engine';
import type { GeoSpecMatcherName } from 'geospec/engine';
import type { GeoSpecMatcherInvocation } from '#matchers/types.js';
import type {
  BrepEvidence,
  ConnectedComponentsResult,
  GeometryDiagnostic,
  GeometryStats,
  GeometrySubject,
  MeshQualityStats,
  Vec3,
  WatertightResult,
} from '#mesh/types.js';
import { boxSoup, subjectFromNamedSoups } from '#mesh/testing/overlap-subjects.js';
import { geoSpecMatcherImplementations } from '#matchers/implementations.js';
import {
  describeNumeric,
  describeSelector,
  matcherDiagnostic,
  matcherSubject,
  numericHolds,
  pointComponents,
  pointFailures,
} from '#matchers/support.js';

const watertightResult = (overrides?: Partial<WatertightResult>): WatertightResult => ({
  watertight: true,
  irregularEdges: 0,
  openBoundaryEdges: 0,
  nonManifoldEdges: 0,
  irregularEdgeKindCounts: { openBoundary: 0, nonManifold: 0 },
  irregularEdgeClusters: [],
  totalEdges: 12,
  irregularEdgeFraction: 0,
  perPrimitive: [],
  ...overrides,
});

const meshQuality = (overrides?: Partial<MeshQualityStats>): MeshQualityStats => ({
  triangleCount: 12,
  nonFiniteVertices: [],
  degenerateTriangles: [],
  duplicateFaces: [],
  triangles: [],
  surfaceArea: 600,
  signedVolume: 1000,
  centerOfMass: [0, 0, 0],
  ...overrides,
});

const stats = (overrides?: {
  quality?: Partial<MeshQualityStats>;
  watertight?: Partial<WatertightResult>;
  components?: ConnectedComponentsResult;
  boundingBox?: GeometryStats['boundingBox'];
}): GeometryStats => {
  const components: ConnectedComponentsResult = overrides?.components ?? { count: 1, clusters: [], gaps: [] };
  return {
    vertexCount: 8,
    meshCount: 1,
    triangleCount: 12,
    meshQuality: meshQuality(overrides?.quality),
    connectedComponents: () => components.count,
    analyseConnectedComponents: () => components,
    watertight: overrides?.watertight?.watertight ?? true,
    analyseWatertight: () => watertightResult(overrides?.watertight),
    boundingBox:
      overrides && 'boundingBox' in overrides
        ? overrides.boundingBox
        : { size: [10, 10, 10], center: [0, 0, 0], primitives: [] },
  };
};

const subject = (overrides?: {
  brep?: BrepEvidence;
  step?: GeometrySubject['step'];
  stats?: GeometryStats;
}): GeometrySubject => ({
  kind: 'geometry-subject',
  mesh: { format: 'mesh-buffer', stats: overrides?.stats ?? stats() },
  ...(overrides?.brep === undefined ? {} : { brep: overrides.brep }),
  ...(overrides?.step === undefined ? {} : { step: overrides.step }),
  provenance: { source: { kind: 'mesh-buffer', format: 'mesh-buffer' }, unit: 'mm', loader: 'in-memory' },
  capabilities: [],
  diagnostics: [],
});

// oxlint-disable-next-line eslint/max-params -- (matcher, subject, expectation, call-arguments) is the invocation's own shape; an options bag would obscure every one of the ~60 call sites.
const run = async (
  matcher: GeoSpecMatcherName,
  target: unknown,
  expected: unknown,
  callArguments?: readonly unknown[],
): Promise<readonly GeometryDiagnostic[]> => {
  const implementation = geoSpecMatcherImplementations[matcher];
  if (!implementation) {
    throw new Error(`this build does not register ${matcher}`);
  }
  const invocation: GeoSpecMatcherInvocation = {
    protocolVersion: 1,
    matcher,
    kind: geoSpecMatcherDescriptors[matcher].kind,
    subject: target,
    arguments: callArguments ?? [expected],
    expected,
  };
  return implementation(invocation);
};

const codes = (diagnostics: readonly GeometryDiagnostic[]): string[] =>
  diagnostics.map((diagnostic) => diagnostic.code);

describe('matcher support', () => {
  it('should describe every numeric expectation form', () => {
    expect(describeNumeric(5)).toBe('5');
    expect(describeNumeric({})).toBe('any value');
    expect(describeNumeric({ value: 1, greaterThan: 0, greaterThanOrEqual: 0, lessThan: 9, lessThanOrEqual: 9 })).toBe(
      '1 and > 0 and >= 0 and < 9 and <= 9',
    );
  });

  it('should evaluate every numeric expectation form', () => {
    expect(numericHolds(5, 5, 0)).toBe(true);
    expect(numericHolds(5.001, 5, 0.01)).toBe(true);
    expect(numericHolds(6, 5, 0.01)).toBe(false);
    expect(numericHolds(6, { value: 5 }, 0.01)).toBe(false);
    expect(numericHolds(6, { greaterThan: 6 }, 0)).toBe(false);
    expect(numericHolds(6, { greaterThanOrEqual: 6 }, 0)).toBe(true);
    expect(numericHolds(6, { greaterThanOrEqual: 7 }, 0)).toBe(false);
    expect(numericHolds(6, { lessThan: 6 }, 0)).toBe(false);
    expect(numericHolds(6, { lessThanOrEqual: 6 }, 0)).toBe(true);
    expect(numericHolds(6, { lessThanOrEqual: 5 }, 0)).toBe(false);
    expect(numericHolds(6, { greaterThan: 1, lessThan: 9 }, 0)).toBe(true);
  });

  it('should read both point expectation forms', () => {
    expect(pointComponents([1, 2, 3])).toEqual([1, 2, 3]);
    expect(pointComponents({ y: 4 })).toEqual([undefined, 4, undefined]);
    expect(pointFailures([1, 2, 3], { y: 4 }, 0.5)).toEqual([{ axis: 'y', expected: 4, actual: 2 }]);
    expect(pointFailures([1, 2, 3], [1, 2, 3], 0)).toEqual([]);
    expect(pointFailures([], { x: 1 }, 0)[0]?.actual).toBeNaN();
  });

  it('should omit an absent details payload and render a regular-expression selector', () => {
    expect(matcherDiagnostic({ code: 'X', message: 'm', suggestion: 's' })).toEqual({
      code: 'X',
      severity: 'error',
      message: 'm',
      suggestion: 's',
    });
    expect(describeSelector('a')).toBe('a');
    expect(describeSelector(/a/u)).toBe('/a/u');
  });

  it('should name what a matcher was called on instead of a subject', () => {
    const invocation = {
      protocolVersion: 1,
      matcher: 'toHaveVolume',
      kind: 'volume',
      subject: undefined,
      arguments: [],
      expected: {},
    } as const;
    const rejected = matcherSubject(invocation);
    expect('diagnostics' in rejected && rejected.diagnostics[0]?.message).toContain('received undefined');
    expect('diagnostics' in matcherSubject({ ...invocation, subject: null })).toBe(true);
    expect('diagnostics' in matcherSubject({ ...invocation, subject: 42 })).toBe(true);
    expect('diagnostics' in matcherSubject({ ...invocation, subject: {} })).toBe(true);
  });
});

describe('every registered matcher refuses a non-subject', () => {
  it('should answer GEOSPEC_SUBJECT_UNSUPPORTED for each of them', async () => {
    const names = Object.keys(geoSpecMatcherImplementations) as GeoSpecMatcherName[];
    const results = await Promise.all(names.map(async (name) => run(name, 'not a subject', {})));
    for (const [index, diagnostics] of results.entries()) {
      expect(codes(diagnostics), names[index]).toEqual(['GEOSPEC_SUBJECT_UNSUPPORTED']);
    }
  });
});

describe('mesh matchers', () => {
  it('should reject selected subject diagnostic severities with their original evidence', async () => {
    const warned = subject();
    warned.diagnostics.push({
      code: 'GEOMETRY_INVALID',
      severity: 'warning',
      message: 'non-manifold edges 1520',
      details: { topology: { nonManifoldEdges: 1520 } },
    });

    const failed = await run('toHaveNoDiagnostics', warned, { severities: ['error', 'warning'] });
    expect(codes(failed)).toEqual(['GEOSPEC_DIAGNOSTICS_PRESENT']);
    expect(failed[0]?.details).toMatchObject({
      matcher: 'toHaveNoDiagnostics',
      diagnostics: [
        {
          code: 'GEOMETRY_INVALID',
          severity: 'warning',
          details: { topology: { nonManifoldEdges: 1520 } },
        },
      ],
    });
    expect(await run('toHaveNoDiagnostics', warned, { severities: ['error'] })).toEqual([]);
    expect(await run('toHaveNoDiagnostics', subject(), {})).toEqual([]);
  });

  it('should compare mesh bounds and report the failing axes', async () => {
    expect(await run('toHaveBoundingBox', subject(), { size: { x: 10 } })).toEqual([]);
    const failed = await run('toHaveBoundingBox', subject(), { min: [-5, -5, -5], max: [5, 5, 6] });
    expect(codes(failed)).toEqual(['GEOSPEC_BOUNDING_BOX_MISMATCH']);
    expect(failed[0]?.message).toContain('max.z');
    expect(await run('toHaveBoundingBox', subject(), { center: { z: 0 } })).toEqual([]);
  });

  it('should prefer exact BRep bounds whenever they are present', async () => {
    const brep: BrepEvidence = {
      boundingBox: { min: [0, 0, 0], max: [2, 2, 2], size: [2, 2, 2], center: [1, 1, 1] },
    };
    expect(await run('toHaveBoundingBox', subject({ brep }), { max: [2, 2, 2] })).toEqual([]);
    expect(codes(await run('toHaveBoundingBox', subject({ brep }), { size: [10, 10, 10] }))).toEqual([
      'GEOSPEC_BOUNDING_BOX_MISMATCH',
    ]);
  });

  it('should report every failing bounding-box field, from the source it used', async () => {
    const brep: BrepEvidence = {
      boundingBox: { min: [0, 0, 0], max: [2, 2, 2], size: [2, 2, 2], center: [1, 1, 1] },
    };
    const failed = await run('toHaveBoundingBox', subject({ brep }), {
      min: [9, 9, 9],
      max: [9, 9, 9],
      size: [9, 9, 9],
      center: [9, 9, 9],
    });
    expect(failed[0]?.details).toMatchObject({ evidence: 'brep' });
    expect(failed[0]?.message).toContain('size.x');
    expect(failed[0]?.message).toContain('center.x');
  });

  it('should refuse a bounding-box claim on a subject with no mesh bounds', async () => {
    const bare = subject({ stats: stats({ boundingBox: undefined }) });
    expect(codes(await run('toHaveBoundingBox', bare, { max: [1, 1, 1] }))).toEqual(['GEOSPEC_EVIDENCE_UNSUPPORTED']);
  });

  it('should count connected components at the declared tolerance', async () => {
    expect(await run('toHaveConnectedComponents', subject(), { count: 1 })).toEqual([]);
    expect(await run('toHaveConnectedComponents', subject(), { count: 1, tolerance: 1 })).toEqual([]);
    const failed = await run('toHaveConnectedComponents', subject(), { count: 3, toleranceMm: 0.5 });
    expect(codes(failed)).toEqual(['GEOSPEC_CONNECTED_COMPONENTS_MISMATCH']);
  });

  it('should read the watertight analysis, not the cheap boolean', async () => {
    expect(await run('toBeWatertight', subject(), true, [])).toEqual([]);
    const leaky = subject({
      stats: stats({ watertight: { watertight: false, irregularEdges: 4, openBoundaryEdges: 4 } }),
    });
    expect(codes(await run('toBeWatertight', leaky, true, []))).toEqual(['GEOSPEC_WATERTIGHT_MISMATCH']);
  });

  it('should judge every mesh-integrity clause', async () => {
    expect(
      await run('toHaveMeshIntegrity', subject(), {
        finitePositions: true,
        degenerateTriangles: { count: 0, maxCount: 0 },
        duplicateFaces: { count: 0, maxCount: 0 },
        watertight: true,
        triangleCount: 12,
      }),
    ).toEqual([]);
    const dirty = subject({
      stats: stats({
        quality: {
          nonFiniteVertices: [{ primitive: 'a', vertexIndex: 0, position: [Number.NaN, 0, 0] }],
          degenerateTriangles: [{ primitive: 'a', triangleIndex: 0, area: 0, center: [0, 0, 0] }],
          duplicateFaces: [{ primitive: 'a', triangleIndex: 1, firstTriangleIndex: 0 }],
          triangles: [
            {
              primitive: 'a',
              triangleIndex: 0,
              a: [0, 0, 0],
              b: [1, 0, 0],
              c: [0, 1, 0],
              center: [1 / 3, 1 / 3, 0],
              area: 0.5,
            },
            {
              primitive: 'a',
              triangleIndex: 1,
              a: [0, 0, 0],
              b: [1, 0, 0],
              c: [0, 1, 0],
              center: [1 / 3, 1 / 3, 0],
              area: 0.5,
            },
          ],
        },
        watertight: { watertight: false },
      }),
    });
    const failed = await run('toHaveMeshIntegrity', dirty, {
      finitePositions: true,
      degenerateTriangles: { count: 0, maxCount: 0, areaTolerance: 1 },
      duplicateFaces: { count: 0, maxCount: 0 },
      watertight: true,
      triangleCount: { greaterThan: 100 },
    });
    expect(codes(failed)).toEqual(['GEOSPEC_MESH_INTEGRITY_MISMATCH']);
    expect(failed[0]?.message).toContain('non-finite');
    expect(failed[0]?.details).toMatchObject({
      nonFiniteVertices: [{ primitive: 'a', vertexIndex: 0, position: ['NaN', '0', '0'] }],
      degenerateTriangles: [{ primitive: 'a', triangleIndex: 0, center: [0, 0, 0] }],
      duplicateFaces: [{ primitive: 'a', triangleIndex: 1, center: [1 / 3, 1 / 3, 0] }],
    });
    expect(await run('toHaveMeshIntegrity', dirty, {})).toEqual([]);
  });

  it('should measure surface area, volume, mass and centre of mass', async () => {
    const brep: BrepEvidence = {
      massProperties: { surfaceArea: 600, volume: 1000, centerOfMass: [1, 1, 1], mass: 7.8 },
    };
    expect(await run('toHaveSurfaceArea', subject({ brep }), { value: 600 })).toEqual([]);
    expect(await run('toHaveVolume', subject({ brep }), { value: 1000 })).toEqual([]);
    expect(await run('toHaveMass', subject({ brep }), { value: 7.8 })).toEqual([]);
    expect(await run('toHaveCenterOfMass', subject({ brep }), { point: [1, 1, 1] })).toEqual([]);

    expect(codes(await run('toHaveSurfaceArea', subject({ brep }), { value: 1 }))).toEqual([
      'GEOSPEC_MEASUREMENT_MISMATCH',
    ]);
    expect(codes(await run('toHaveCenterOfMass', subject({ brep }), { point: [9, 9, 9] }))).toEqual([
      'GEOSPEC_MEASUREMENT_MISMATCH',
    ]);
  });

  it('should fall back to mesh scalars for a mesh-only subject', async () => {
    expect(await run('toHaveSurfaceArea', subject(), { value: 600 })).toEqual([]);
    expect(await run('toHaveVolume', subject(), { value: 1000 })).toEqual([]);
    const noCentroid = subject({ stats: stats({ quality: { centerOfMass: undefined } }) });
    expect(codes(await run('toHaveCenterOfMass', noCentroid, { point: [0, 0, 0] }))).toEqual([
      'GEOSPEC_EVIDENCE_UNSUPPORTED',
    ]);
  });

  it('should refuse a scalar the chosen source cannot produce', async () => {
    const emptyBrep: BrepEvidence = { massProperties: {} };
    expect(codes(await run('toHaveSurfaceArea', subject({ brep: emptyBrep }), { value: 1 }))).toEqual([
      'GEOSPEC_EVIDENCE_UNSUPPORTED',
    ]);
  });

  it('should derive mass from density, and refuse when it cannot', async () => {
    expect(await run('toHaveMass', subject(), { value: 7.85, density: 0.00785, tolerance: 0.01 })).toEqual([]);
    expect(codes(await run('toHaveMass', subject(), { value: 1 }))).toEqual(['GEOSPEC_EVIDENCE_UNSUPPORTED']);
    expect(codes(await run('toHaveMass', subject(), { value: 99, density: 0.00785 }))).toEqual([
      'GEOSPEC_MEASUREMENT_MISMATCH',
    ]);
  });

  it('should not fall back to mesh when BRep scalar evidence exists', async () => {
    const brep: BrepEvidence = { massProperties: { surfaceArea: 1, volume: 1 } };
    expect(await run('toHaveSurfaceArea', subject({ brep }), { value: 1 })).toEqual([]);
    expect(codes(await run('toHaveSurfaceArea', subject({ brep }), { value: 600 }))).toEqual([
      'GEOSPEC_MEASUREMENT_MISMATCH',
    ]);
  });

  it('should report the mesh source used by a mesh-only mass claim', async () => {
    const failed = await run('toHaveMass', subject(), { value: 99, density: 0.00785 });
    expect(failed[0]?.details).toMatchObject({ evidence: 'mesh' });
  });

  it('should report unexplained interference and honour allowances', async () => {
    const overlapping = subjectFromNamedSoups(
      [
        { name: 'left', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
        { name: 'right', soup: boxSoup([5, 0, 0], [15, 10, 10]) },
      ],
      { contentHash: 'matcher-overlap' },
    );
    const detected = await run('toHaveNoComponentInterference', overlapping, { tolerance: 1e-6 });
    expect(codes(detected)).toEqual(['GEOSPEC_COMPONENT_INTERFERENCE_DETECTED']);
    expect(detected[0]?.message).toContain('left');

    const allowed = await run('toHaveNoComponentInterference', overlapping, {
      allowances: [{ kind: 'intentionalInterference', left: 'right', right: /left/, reason: 'press fit' }],
    });
    expect(allowed).toEqual([]);

    const noExpectation = await run('toHaveNoComponentInterference', overlapping, undefined, []);
    expect(codes(noExpectation)).toEqual(['GEOSPEC_COMPONENT_INTERFERENCE_DETECTED']);

    const overBudget = await run('toHaveNoComponentInterference', overlapping, {
      pairs: [{ left: 'left', right: 'right' }],
      allowances: [{ kind: 'intentionalInterference', left: 'left', right: 'right', maxVolume: 1, reason: 'gasket' }],
    });
    expect(codes(overBudget)).toEqual(['GEOSPEC_COMPONENT_INTERFERENCE_DETECTED']);
  }, 120_000);
});

describe('BRep matchers', () => {
  const brep: BrepEvidence = {
    validity: {
      valid: true,
      maxTolerance: 1e-6,
      freeBounds: { count: 0 },
      smallEdges: [{ length: 0.5 }],
      sameParameter: true,
      closedShells: true,
      closedWires: true,
    },
    topologyCounts: { vertices: 8, edges: 12, faces: 6, solids: 1 },
    planarFaces: [{ normal: [0, 0, 1], offset: 5, area: 100, center: [0, 0, 5] }],
    cylindricalFaces: [{ radius: 4, axis: 'z' }],
    circularHoles: [{ diameter: 8, through: true, axis: 'z', center: [0, 0, 0] }],
    circularHolePatterns: [{ count: 4, holeDiameter: 8, boltCircleDiameter: 40, axis: 'z', center: [0, 0, 0] }],
    chamferFeatures: [{ distance: 1.2, selection: 'top' }],
    filletFeatures: [{ radius: 2.5 }],
    minimumWallThickness: { value: 4.2 },
  };
  const solid = subject({ brep });

  it('should refuse every BRep claim on a mesh-only subject', async () => {
    const names = [
      'toBeValidBrep',
      'toHaveTopologyCounts',
      'toHavePlanarFace',
      'toHaveCylindricalFace',
      'toHaveCircularHole',
      'toHaveCircularHolePattern',
      'toHaveChamferFeature',
      'toHaveFilletFeature',
      'toHaveMinimumWallThickness',
    ] as GeoSpecMatcherName[];
    const everyClaim = {
      distance: 1,
      radius: 1,
      diameter: 1,
      count: 1,
      value: 1,
      normal: [0, 0, 1],
      offset: 0,
      axis: 'z',
      holeDiameter: 1,
    };
    const results = await Promise.all(names.map(async (name) => run(name, subject(), everyClaim)));
    for (const [index, diagnostics] of results.entries()) {
      expect(codes(diagnostics), names[index]).toEqual(['GEOSPEC_EVIDENCE_UNSUPPORTED']);
    }
  });

  it('should accept a valid shape and report each validity clause that fails', async () => {
    expect(await run('toBeValidBrep', solid, undefined, [])).toEqual([]);
    expect(await run('toBeValidBrep', solid, {})).toEqual([]);
    expect(
      await run('toBeValidBrep', solid, {
        maxTolerance: 1e-3,
        freeBounds: { count: 0 },
        minEdgeLength: 0.1,
        sameParameter: true,
        closedShells: true,
        closedWires: true,
      }),
    ).toEqual([]);
    const reasonless = subject({ brep: { validity: { valid: false } } });
    const reasonlessDiagnostics = await run('toBeValidBrep', reasonless, {});
    expect(reasonlessDiagnostics[0]?.message).toContain('shape invalid.');

    const broken = subject({
      brep: {
        validity: {
          valid: false,
          reason: 'open shell',
          maxTolerance: 1,
          freeBounds: { count: 2 },
          smallEdges: [{ length: 0.001 }],
          sameParameter: false,
          closedShells: false,
          closedWires: false,
        },
      },
    });
    const failed = await run('toBeValidBrep', broken, {
      maxTolerance: 1e-3,
      freeBounds: { count: 0 },
      minEdgeLength: 0.1,
      sameParameter: true,
      closedShells: true,
      closedWires: true,
    });
    expect(codes(failed)).toEqual(['GEOSPEC_FEATURE_MISMATCH']);
    expect(failed[0]?.message).toContain('open shell');
  });

  it('should read a validity facet with no optional members', async () => {
    const bare = subject({ brep: { validity: { valid: true } } });
    expect(await run('toBeValidBrep', bare, {})).toEqual([]);
    // No reported free bounds and no reported small edges: both read as zero
    // rather than as "unknown", because the kernel reports what it found.
    expect(await run('toBeValidBrep', bare, { freeBounds: { count: 0 }, minEdgeLength: 1 })).toEqual([]);
    const freeBounds = await run('toBeValidBrep', bare, { freeBounds: { count: { greaterThan: 0 } } });
    expect(freeBounds[0]?.message).toContain('0 free bounds');
  });

  it('should compare topology counts', async () => {
    expect(await run('toHaveTopologyCounts', solid, { faces: 6, solids: 1 })).toEqual([]);
    expect(await run('toHaveTopologyCounts', solid, {})).toEqual([]);
    expect(codes(await run('toHaveTopologyCounts', solid, { faces: 7, wires: 2 }))).toEqual([
      'GEOSPEC_FEATURE_MISMATCH',
    ]);
  });

  it('should find a planar face by normal, offset and area, in either orientation', async () => {
    expect(await run('toHavePlanarFace', solid, { normal: [0, 0, 1], offset: 5, area: 100 })).toEqual([]);
    expect(await run('toHavePlanarFace', solid, { normal: [0, 0, -1], offset: -5 })).toEqual([]);
    expect(codes(await run('toHavePlanarFace', solid, { normal: [1, 0, 0], offset: 5 }))).toEqual([
      'GEOSPEC_FEATURE_MISMATCH',
    ]);
    expect(codes(await run('toHavePlanarFace', solid, { normal: [0, 0, 1], offset: 5, area: 1 }))).toEqual([
      'GEOSPEC_FEATURE_MISMATCH',
    ]);
    const noArea = subject({ brep: { planarFaces: [{ normal: [0, 0, 1], offset: 5 }] } });
    expect(codes(await run('toHavePlanarFace', noArea, { normal: [0, 0, 1], offset: 5, area: 100 }))).toEqual([
      'GEOSPEC_FEATURE_MISMATCH',
    ]);
  });

  it('should find cylindrical faces, holes, patterns, chamfers and fillets', async () => {
    expect(await run('toHaveCylindricalFace', solid, { radius: 4, axis: 'z' })).toEqual([]);
    expect(codes(await run('toHaveCylindricalFace', solid, { radius: 4, axis: 'x' }))).toEqual([
      'GEOSPEC_FEATURE_MISMATCH',
    ]);

    expect(await run('toHaveCircularHole', solid, { diameter: 8 })).toEqual([]);
    expect(await run('toHaveCircularHole', solid, { diameter: 8, through: true, axis: 'z', center: { x: 0 } })).toEqual(
      [],
    );
    expect(codes(await run('toHaveCircularHole', solid, { diameter: 8, through: false }))).toEqual([
      'GEOSPEC_FEATURE_MISMATCH',
    ]);
    expect(codes(await run('toHaveCircularHole', solid, { diameter: 8, center: { x: 9 } }))).toEqual([
      'GEOSPEC_FEATURE_MISMATCH',
    ]);

    expect(await run('toHaveCircularHolePattern', solid, { count: 4, holeDiameter: 8 })).toEqual([]);
    expect(
      await run('toHaveCircularHolePattern', solid, {
        count: 4,
        holeDiameter: 8,
        boltCircleDiameter: 40,
        axis: 'z',
        center: { z: 0 },
      }),
    ).toEqual([]);
    expect(codes(await run('toHaveCircularHolePattern', solid, { count: 5, holeDiameter: 8 }))).toEqual([
      'GEOSPEC_FEATURE_MISMATCH',
    ]);
    expect(
      codes(await run('toHaveCircularHolePattern', solid, { count: 4, holeDiameter: 8, center: { z: 9 } })),
    ).toEqual(['GEOSPEC_FEATURE_MISMATCH']);

    expect(await run('toHaveChamferFeature', solid, { distance: 1.2, selection: 'top' })).toEqual([]);
    expect(codes(await run('toHaveChamferFeature', solid, { distance: 1.2, selection: 'side' }))).toEqual([
      'GEOSPEC_FEATURE_MISMATCH',
    ]);
    expect(await run('toHaveFilletFeature', solid, { radius: 2.5 })).toEqual([]);
    expect(codes(await run('toHaveFilletFeature', solid, { radius: 2.5, selection: 'edge' }))).toEqual([
      'GEOSPEC_FEATURE_MISMATCH',
    ]);
    expect(codes(await run('toHaveFilletFeature', solid, { radius: 9, selection: 'x' }))).toEqual([
      'GEOSPEC_FEATURE_MISMATCH',
    ]);
  });

  it('should judge the minimum wall thickness', async () => {
    expect(await run('toHaveMinimumWallThickness', solid, { value: { greaterThanOrEqual: 4 } })).toEqual([]);
    expect(codes(await run('toHaveMinimumWallThickness', solid, { value: { greaterThanOrEqual: 9 } }))).toEqual([
      'GEOSPEC_FEATURE_MISMATCH',
    ]);
  });
});

describe('STEP matchers', () => {
  const step: GeometrySubject['step'] = {
    unit: 'mm',
    readStrategy: {
      strategy: 'native-stream',
      inputKind: 'path',
      bytesRead: 1,
      nativeReadStream: true,
      copiedToEmscriptenFs: false,
    },
    capabilities: [],
    xde: {
      occurrences: [
        {
          path: 'block',
          productName: 'block',
          transform: [],
          shapeIndex: 0,
          bounds: { min: [0, 0, 0], max: [2, 2, 2] },
          ordinalPath: [1],
        },
        {
          path: 'cover',
          productName: 'cover',
          transform: [],
          shapeIndex: 1,
          bounds: { min: [0, 0, 2], max: [2, 2, 3] },
          ordinalPath: [2],
        },
      ],
      subshapeNames: [],
      datums: [],
    } as unknown as NonNullable<GeometrySubject['step']>['xde'],
  };
  const stepSubject = subject({ step });

  it('should compare the STEP unit', async () => {
    expect(await run('toHaveStepUnits', stepSubject, { unit: 'mm' })).toEqual([]);
    expect(codes(await run('toHaveStepUnits', stepSubject, { unit: 'm' }))).toEqual(['GEOSPEC_FEATURE_MISMATCH']);
    expect(codes(await run('toHaveStepUnits', subject(), { unit: 'mm' }))).toEqual(['GEOSPEC_EVIDENCE_UNSUPPORTED']);
  });

  it('should check the product structure both ways', async () => {
    expect(await run('toHaveProductStructure', stepSubject, { names: ['block'], count: 2 })).toEqual([]);
    expect(await run('toHaveProductStructure', stepSubject, {})).toEqual([]);
    const wrongCount = await run('toHaveProductStructure', stepSubject, { count: 9 });
    expect(wrongCount[0]?.message).toContain('the file carries 2 products');
    const missingOnly = await run('toHaveProductStructure', stepSubject, { names: ['ghost'] });
    expect(missingOnly[0]?.message).toBe('1 declared product(s) are absent: ghost');
    const failed = await run('toHaveProductStructure', stepSubject, {
      names: ['block', 'ghost'],
      count: { greaterThanOrEqual: 9 },
    });
    expect(codes(failed)).toEqual(['GEOSPEC_FEATURE_MISMATCH']);
    expect(failed[0]?.message).toContain('ghost');
    expect(failed[0]?.message).toContain('the file carries 2 products');
    expect(codes(await run('toHaveProductStructure', subject(), { names: [] }))).toEqual([
      'GEOSPEC_EVIDENCE_UNSUPPORTED',
    ]);
    expect(
      codes(await run('toHaveProductStructure', subject({ stats: stats({ boundingBox: undefined }) }), { names: [] })),
    ).toEqual(['GEOSPEC_EVIDENCE_UNSUPPORTED']);

    const meshOnly = subject({
      stats: stats({
        boundingBox: {
          size: [1, 1, 1],
          center: [0, 0, 0],
          primitives: [{ name: 'mesh-part#0', vertices: 8, aabb: { min: [0, 0, 0], max: [1, 1, 1] } }],
        },
      }),
    });
    expect(await run('toHaveProductStructure', meshOnly, { names: ['mesh-part'], count: 1 })).toEqual([]);
  });

  it('should check assembly occurrences from STEP structure', async () => {
    expect(
      await run('toHaveAssemblyOccurrences', stepSubject, {
        uniqueNames: true,
        occurrences: [
          { name: 'block', count: 1, bounds: { min: [0, 0, 0], max: [2, 2, 2], center: { z: 1 } } },
          { name: /^c/ },
        ],
      }),
    ).toEqual([]);
    const failed = await run('toHaveAssemblyOccurrences', stepSubject, {
      occurrences: [{ name: 'ghost', count: 1 }, { name: 'phantom' }],
    });
    expect(codes(failed)).toEqual(['GEOSPEC_FEATURE_MISMATCH']);
    expect(failed[0]?.message).toContain('ghost');
    const wrongBounds = await run('toHaveAssemblyOccurrences', stepSubject, {
      occurrences: [{ name: 'block', bounds: { max: [9, 9, 9] } }],
    });
    expect(wrongBounds[0]?.message).toContain('max.x');
  });

  it('should fall back to named mesh nodes, with bounds', async () => {
    const meshOnly = subject({
      stats: stats({
        boundingBox: {
          size: [10, 10, 10],
          center: [0, 0, 0],
          primitives: [
            { name: 'block#0', vertices: 8, aabb: { min: [0, 0, 0], max: [2, 2, 2] } },
            { name: 'block#1', vertices: 8, aabb: { min: [0, 0, 0], max: [2, 2, 2] } },
          ],
        },
      }),
    });
    expect(
      await run('toHaveAssemblyOccurrences', meshOnly, {
        occurrences: [{ name: 'block', count: 2, bounds: { min: [0, 0, 0], max: [2, 2, 2], center: { x: 1 } } }],
      }),
    ).toEqual([]);
    const failed = await run('toHaveAssemblyOccurrences', meshOnly, {
      uniqueNames: true,
      occurrences: [{ name: 'block', bounds: { max: [9, 9, 9] } }],
    });
    expect(failed[0]?.message).toContain('max.x');

    const many = await run('toHaveAssemblyOccurrences', meshOnly, {
      occurrences: [
        ...Array.from({ length: 9 }, (_unused, index) => ({ name: `ghost${index}` })),
        { name: /nothing/u, count: 1 },
      ],
    });
    expect(many[0]?.message).toContain('more)');
    expect(JSON.stringify(many[0]?.details)).toContain('/nothing/u');

    const boundless = subject({
      stats: stats({ boundingBox: undefined }),
      step: {
        readStrategy: {
          strategy: 'native-stream',
          inputKind: 'path',
          bytesRead: 1,
          nativeReadStream: true,
          copiedToEmscriptenFs: false,
        },
        capabilities: [],
        xde: {
          occurrences: [{ path: 'boundless', productName: 'boundless', transform: [], shapeIndex: 0 }],
          subshapeNames: [],
          datumPlacements: [],
          semanticDatums: [],
          datumSystems: [],
          supplementalPlanes: [],
          freeShapeCount: 0,
        },
      },
    });
    expect(
      codes(
        await run('toHaveAssemblyOccurrences', boundless, {
          occurrences: [{ name: 'boundless', bounds: { min: [0, 0, 0] } }],
        }),
      ),
    ).toEqual(['GEOSPEC_EVIDENCE_UNSUPPORTED']);
    expect(codes(await run('toHaveAssemblyOccurrences', subject(), { occurrences: [] }))).toEqual([
      'GEOSPEC_EVIDENCE_UNSUPPORTED',
    ]);
    expect(
      codes(
        await run('toHaveAssemblyOccurrences', subject({ stats: stats({ boundingBox: undefined }) }), {
          occurrences: [],
        }),
      ),
    ).toEqual(['GEOSPEC_EVIDENCE_UNSUPPORTED']);
  });
});

describe('proof matchers', () => {
  it('should refuse both proof matchers on a mesh-only subject (the D5 precondition)', async () => {
    expect(codes(await run('toHaveSpatialRelationships', subject(), { relationships: [] }))).toEqual([
      'GEOSPEC_EVIDENCE_UNSUPPORTED',
    ]);
    expect(codes(await run('toHaveVoidContinuity', subject(), { path: [[0, 0, 0] as Vec3] }))).toEqual([
      'GEOSPEC_EVIDENCE_UNSUPPORTED',
    ]);
  });

  describe('against exact evidence', () => {
    let guide: GeometrySubject;

    beforeAll(async () => {
      guide = await loadStep({
        source: join(import.meta.dirname, '../../fixtures/containment/valve-stem-guide-positive/model.step'),
        name: 'valve-stem-guide',
      });
    }, 120_000);

    afterAll(() => {
      guide.nativeXde?.delete?.();
    });

    it('should prove a void-continuity claim end to end', async () => {
      expect(
        await run('toHaveVoidContinuity', guide, {
          path: [
            [0, 0, 3],
            [0, 0, 42],
          ],
          material: ['guide'],
        }),
      ).toEqual([]);
    }, 60_000);

    it('should resolve a regular-expression endpoint as an occurrence name', async () => {
      expect(
        await run('toHaveSpatialRelationships', guide, {
          relationships: [{ kind: 'coaxial', subject: 'valve.stem', target: /^guide$/, tolerance: 0.05 }],
        }),
      ).toBeDefined();
    });

    it('should name whichever endpoint failed to resolve', async () => {
      const badTarget = await run('toHaveSpatialRelationships', guide, {
        relationships: [{ kind: 'contact', subject: 'valve.stem', target: 'nope.nothing' }],
      });
      expect(badTarget[0]?.message).toContain('the target selector');
      const badSubject = await run('toHaveSpatialRelationships', guide, {
        relationships: [{ kind: 'contact', subject: 'nope.nothing', target: 'valve.stem' }],
      });
      expect(badSubject[0]?.message).toContain('the subject selector');
    });
  });
});
