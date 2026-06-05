import { describe, expect, it, vi } from 'vitest';
import { clearCollectorGlobals, createCollector, installCollector } from '#runner/collector.js';
import type { GeometrySubject, MeshTriangle } from '#mesh/types.js';
import type { GeoSpecOpenCascadeMeshModule } from '#mesh/native.js';
import type { GeoSpecComponentOverlapExpectation } from '#runner/types.js';

/* eslint-disable @typescript-eslint/naming-convention -- OpenCascade.js embind module keys are generated API names. */

let nativeEvidenceJson = JSON.stringify({
  success: true,
  componentCount: 2,
  checkedPairs: 1,
  overlaps: [],
});

vi.mock('geospec/native/opencascade/single', () => ({
  default: async () => {
    const heapF64 = new Float64Array(1024);
    const heap32 = new Int32Array(heapF64.buffer);
    let nextPointer = 0;
    return {
      HEAP32: heap32,
      HEAPF64: heapF64,
      _malloc(bytes: number) {
        const pointer = nextPointer;
        nextPointer += bytes;
        return pointer;
      },
      _free() {
        return undefined;
      },
      GeoSpecMeshMetrics: {
        chamferDistanceFromTrianglePointers() {
          throw new Error('distance analyzer should not run for component overlap');
        },
        componentOverlapFromTrianglePointers() {
          return {
            success: true,
            evidenceJson: () => nativeEvidenceJson,
            delete() {
              return undefined;
            },
          };
        },
      },
    } satisfies GeoSpecOpenCascadeMeshModule;
  },
}));

const triangle = (primitive: string, triangleIndex: number, x: number): MeshTriangle => ({
  primitive,
  triangleIndex,
  a: [x, 0, 0],
  b: [x + 1, 0, 0],
  c: [x, 1, 0],
  center: [x + 1 / 3, 1 / 3, 0],
  area: 0.5,
});

const subject = (): GeometrySubject => ({
  kind: 'geometry-subject',
  mesh: {
    format: 'mesh-buffer',
    stats: {
      vertexCount: 6,
      meshCount: 1,
      triangleCount: 2,
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
      boundingBox: {
        size: [5, 1, 0],
        center: [2.5, 0.5, 0],
        primitives: [
          { name: 'sun#0', color: '#ffcc00', vertices: 3, aabb: { min: [0, 0, 0], max: [1, 1, 0] } },
          { name: 'ring#0', color: '#223344', vertices: 3, aabb: { min: [4, 0, 0], max: [5, 1, 0] } },
        ],
      },
      meshQuality: {
        triangleCount: 2,
        nonFiniteVertices: [],
        degenerateTriangles: [],
        duplicateFaces: [],
        triangles: [triangle('sun#0', 0, 0), triangle('ring#0', 1, 4)],
        surfaceArea: 1,
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

const runOneAssertion = async (callback: (collector: ReturnType<typeof createCollector>) => void | Promise<void>) => {
  const collector = createCollector();
  installCollector(collector);
  try {
    collector.it('should evaluate component overlap', async () => callback(collector));
    await collector.waitForCompletion(1000);
    return collector.tests[0]!;
  } finally {
    clearCollectorGlobals();
  }
};

describe('component overlap matcher', () => {
  it('should pass when native analysis reports no positive-volume overlaps', async () => {
    nativeEvidenceJson = JSON.stringify({
      success: true,
      componentCount: 2,
      checkedPairs: 1,
      overlaps: [],
    });

    const test = await runOneAssertion((collector) => {
      collector.expectGeo(subject()).toHaveNoComponentOverlap({ tolerance: 0.1 });
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

  it('should fail with structured diagnostics when native analysis finds overlap volume', async () => {
    nativeEvidenceJson = JSON.stringify({
      success: true,
      componentCount: 2,
      checkedPairs: 1,
      overlaps: [
        {
          leftComponentId: 0,
          rightComponentId: 1,
          intersectionVolume: 2.5,
          witnessPoint: [1, 2, 3],
        },
      ],
    });

    const test = await runOneAssertion((collector) => {
      collector.expectGeo(subject()).toHaveNoComponentOverlap({ tolerance: 0.1 });
    });

    expect(test.status).toBe('failed');
    expect(test.assertions[0]).toMatchObject({
      kind: 'componentOverlap',
      passed: false,
      diagnostics: [
        {
          code: 'GEOSPEC_COMPONENT_OVERLAP_DETECTED',
          severity: 'error',
          spatial: { center: [1, 2, 3] },
          details: {
            componentSource: 'named',
            componentCount: 2,
            checkedPairs: 1,
            tolerance: 0.1,
            unit: 'mm',
            parameters: { gearCount: 4 },
            overlaps: [
              {
                leftLabel: 'sun#0',
                rightLabel: 'ring#0',
                leftColor: '#ffcc00',
                rightColor: '#223344',
                intersectionVolume: 2.5,
                penetration: 'positive-volume',
              },
            ],
          },
        },
      ],
    });
  });

  it('should reject unsupported public option fields before native analysis', async () => {
    const invalidExpectation = {
      tolerance: 0.1,
      components: 'auto',
    } as unknown as GeoSpecComponentOverlapExpectation;

    const test = await runOneAssertion((collector) => {
      collector.expectGeo(subject()).toHaveNoComponentOverlap(invalidExpectation);
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
});

/* eslint-enable @typescript-eslint/naming-convention -- Return to normal naming checks after generated OpenCascade.js test doubles. */
