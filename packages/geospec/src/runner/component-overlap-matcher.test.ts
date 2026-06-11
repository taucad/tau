import { describe, expect, it } from 'vitest';
import { clearCollectorGlobals, createCollector, installCollector } from '#runner/collector.js';
import type { GeometrySubject, MeshTriangle, Vec3 } from '#mesh/types.js';
import type { GeoSpecComponentOverlapExpectation } from '#runner/types.js';

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

const area = (a: Vec3, b: Vec3, c: Vec3): number => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return (
    Math.hypot(
      ab[1]! * ac[2]! - ab[2]! * ac[1]!,
      ab[2]! * ac[0]! - ab[0]! * ac[2]!,
      ab[0]! * ac[1]! - ab[1]! * ac[0]!,
    ) / 2
  );
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
      area: area(a, b, c),
    });
  }
  return triangles;
};

const subjectFromTriangles = (triangles: MeshTriangle[]): GeometrySubject => ({
  kind: 'geometry-subject',
  mesh: {
    format: 'mesh-buffer',
    stats: {
      vertexCount: triangles.length * 3,
      meshCount: new Set(triangles.map((triangle) => triangle.primitive)).size,
      triangleCount: triangles.length,
      connectedComponents: () => 2,
      analyseConnectedComponents: () => ({ count: 2, clusters: [], gaps: [] }),
      watertight: true,
      analyseWatertight: () => ({
        watertight: true,
        irregularEdges: 0,
        openBoundaryEdges: 0,
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
    parameters: { gearCount: 4 },
  },
  capabilities: [{ kind: 'mesh', feature: 'component-overlap' }],
  diagnostics: [],
});

const subject = (x: number): GeometrySubject =>
  subjectFromTriangles([
    ...trianglesFromFlat('left-box#0', boxPositions),
    ...trianglesFromFlat('right-box#0', shiftBox(x), 12),
  ]);

const pairFilteredSubject = (): GeometrySubject =>
  subjectFromTriangles([
    ...trianglesFromFlat('ring#0', boxPositions),
    ...trianglesFromFlat('planet#0', shiftBox(20), 12),
    ...trianglesFromFlat('carrier#0', shiftBox(50), 24),
    ...trianglesFromFlat('shaft#0', shiftBox(59), 36),
  ]);

const runOneAssertion = async (callback: (collector: ReturnType<typeof createCollector>) => void | Promise<void>) => {
  const collector = createCollector();
  installCollector(collector);
  try {
    collector.it('should evaluate component overlap', async () => callback(collector));
    await collector.waitForCompletion(10_000);
    return collector.tests[0]!;
  } finally {
    clearCollectorGlobals();
  }
};

describe('component overlap matcher', () => {
  it('should pass when exact-volume analysis reports no positive-volume overlaps', async () => {
    const test = await runOneAssertion((collector) => {
      collector.expectGeo(subject(15)).toHaveNoComponentOverlap({ tolerance: 0.001 });
    });

    expect(test.status).toBe('passed');
    expect(test.assertions).toEqual([
      expect.objectContaining({
        kind: 'componentOverlap',
        passed: true,
        diagnostics: [],
      }),
    ]);
  });

  it('should fail with structured diagnostics when exact-volume analysis finds overlap volume', async () => {
    const test = await runOneAssertion((collector) => {
      collector.expectGeo(subject(9)).toHaveNoComponentOverlap({ tolerance: 0.001 });
    });

    expect(test.status).toBe('failed');
    expect(test.assertions[0]).toMatchObject({
      kind: 'componentOverlap',
      passed: false,
      diagnostics: [
        {
          code: 'GEOSPEC_COMPONENT_OVERLAP_DETECTED',
          severity: 'error',
          details: {
            componentSource: 'named',
            componentCount: 2,
            checkedPairs: 1,
            tolerance: 0.001,
            unit: 'mm',
            parameters: { gearCount: 4 },
            overlaps: [
              {
                leftLabel: 'left-box#0',
                rightLabel: 'right-box#0',
                penetration: 'positive-volume',
              },
            ],
          },
        },
      ],
    });
    const details = test.assertions[0]?.diagnostics?.[0]?.details;
    const overlaps =
      typeof details === 'object' && details !== null && 'overlaps' in details ? details.overlaps : undefined;
    expect(Array.isArray(overlaps) ? typeof overlaps[0]?.intersectionVolume : 'missing').toBe('number');
  });

  it('should reject unsupported public option fields before analysis', async () => {
    const invalidExpectation = {
      tolerance: 0.1,
      components: 'auto',
    } as unknown as GeoSpecComponentOverlapExpectation;

    const test = await runOneAssertion((collector) => {
      collector.expectGeo(subject(15)).toHaveNoComponentOverlap(invalidExpectation);
    });

    expect(test.status).toBe('failed');
    const assertion = test.assertions[0];
    expect(assertion?.kind).toBe('componentOverlap');
    const diagnostic = assertion?.diagnostics?.[0];
    expect(diagnostic?.code).toBe('GEOSPEC_INVALID_EXPECTATION');
    expect(diagnostic?.message).toContain("unknown field 'components'");
    expect(diagnostic?.details).toMatchObject({
      matcher: 'toHaveNoComponentOverlap',
      field: 'components',
    });
  });

  it('should restrict overlap checks to selected component pairs', async () => {
    const filtered = await runOneAssertion((collector) => {
      collector.expectGeo(pairFilteredSubject()).toHaveNoComponentOverlap({
        tolerance: 0.001,
        pairs: [{ left: 'ring#0', right: /planet/ }],
      });
    });

    expect(filtered.status).toBe('passed');

    const global = await runOneAssertion((collector) => {
      collector.expectGeo(pairFilteredSubject()).toHaveNoComponentOverlap({ tolerance: 0.001 });
    });

    expect(global.status).toBe('failed');
    expect(global.assertions[0]).toMatchObject({
      kind: 'componentOverlap',
      passed: false,
      diagnostics: [
        {
          code: 'GEOSPEC_COMPONENT_OVERLAP_DETECTED',
          details: {
            overlaps: [
              {
                leftLabel: 'carrier#0',
                rightLabel: 'shaft#0',
                penetration: 'positive-volume',
              },
            ],
          },
        },
      ],
    });
  });

  it('should report structured diagnostics for unmatched component pair selectors', async () => {
    const test = await runOneAssertion((collector) => {
      collector.expectGeo(pairFilteredSubject()).toHaveNoComponentOverlap({
        tolerance: 0.001,
        pairs: [{ left: 'missing#0', right: /planet/ }],
      });
    });

    expect(test.status).toBe('failed');
    expect(test.assertions[0]).toMatchObject({
      kind: 'componentOverlap',
      passed: false,
      diagnostics: [
        {
          code: 'GEOSPEC_COMPONENT_PAIR_SELECTOR_UNMATCHED',
          severity: 'error',
          details: {
            pairIndex: 0,
            side: 'left',
            selector: 'missing#0',
            availableLabels: ['ring#0', 'planet#0', 'carrier#0', 'shaft#0'],
          },
        },
      ],
    });
  });

  it('should reject malformed component pair selectors before analysis', async () => {
    const invalidExpectation = {
      pairs: [{ left: 1, right: 'right-box#0' }],
    } as unknown as GeoSpecComponentOverlapExpectation;

    const test = await runOneAssertion((collector) => {
      collector.expectGeo(subject(15)).toHaveNoComponentOverlap(invalidExpectation);
    });

    expect(test.status).toBe('failed');
    const diagnostic = test.assertions[0]?.diagnostics?.[0];
    expect(diagnostic?.code).toBe('GEOSPEC_INVALID_EXPECTATION');
    expect(diagnostic?.message).toContain("expected 'left' to be a string or RegExp component selector");
  });
});
