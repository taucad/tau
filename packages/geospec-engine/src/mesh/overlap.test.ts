import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { analyzeMeshOverlap, getMeshOverlapCacheStats } from '#mesh/overlap.js';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import type { GeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import type { GeometryDiagnostic, GeometrySubject, MeshTriangle, Vec3, WatertightResult } from '#mesh/types.js';
import { createGeoSpecResourceScopeProfile } from '#runner/profile.js';
import { createGeoSpecResourceScope } from '#runner/resource-scope.js';

/**
 * In-memory evidence store for the lazy-prepare gate: a real `engineDigest`
 * (so the cache is live), content-addressed `hashBytes`/`digestKey`, and a Map
 * backing get/put — enough to exercise the persistent overlap-pair-volume peek.
 */
const createMemoryEvidenceStore = (): GeoSpecEvidenceStore => {
  const entries = new Map<string, Uint8Array<ArrayBuffer>>();
  const sha = (input: string | Uint8Array<ArrayBuffer>): string =>
    createHash('sha256')
      .update(typeof input === 'string' ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength))
      .digest('hex');
  return {
    get: (family, keyDigest) => entries.get(`${family}:${keyDigest}`),
    put: (family, keyDigest, value) => {
      entries.set(`${family}:${keyDigest}`, value);
    },
    engineDigest: () => 'test-engine-v1',
    hashBytes: (bytes) => sha(bytes),
    digestKey: (canonicalKey) => sha(canonicalKey),
  };
};

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

const occurrenceSubject = (
  occurrences: Array<{ path?: string; instanceName?: string; productName?: string }>,
  occurrenceMesh: NonNullable<GeometrySubject['occurrenceMesh']>,
): GeometrySubject => ({
  ...subjectFromTriangles(trianglesFromFlat('assembly', boxPositions)),
  step: { xde: { occurrences } } as unknown as GeometrySubject['step'],
  occurrenceMesh,
});

describe('analyzeMeshOverlap', () => {
  it('should reject incomplete STEP occurrence partitions', async () => {
    const missingStep = occurrenceSubject([], () => undefined);
    missingStep.step = undefined;
    const onlyMesh = { positions: Float32Array.from(boxPositions), triangleCount: 12 };
    const results = await Promise.all(
      [
        missingStep,
        occurrenceSubject([{ path: 'only' }], () => onlyMesh),
        occurrenceSubject([{ path: 'left' }, { path: 'missing' }], (index) => (index === 0 ? onlyMesh : undefined)),
      ].map(async (subject) => analyzeMeshOverlap({ subject, tolerance: 0.001 })),
    );

    expect(results.every((result) => !result.success)).toBe(true);
  });

  it('should partition usable STEP occurrence meshes with stable fallback labels', async () => {
    const result = await analyzeMeshOverlap({
      subject: occurrenceSubject([{}, { productName: 'right' }, { path: 'empty' }], (index) => {
        if (index === 2) {
          return { positions: new Float32Array(), triangleCount: 0 };
        }
        return {
          positions: Float32Array.from(index === 0 ? boxPositions : shiftBox(15)),
          triangleCount: 12,
        };
      }),
      tolerance: 0.001,
    });

    expect(result).toMatchObject({
      success: true,
      evidence: {
        componentCount: 2,
        checkedPairs: 0,
        overlaps: [],
      },
    });
  });

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
          invalidDiagnosticSets: 0,
          disposed: false,
        });

        const second = await analyzeMeshOverlap({ subject, tolerance: 0.5 });
        expect(second.success).toBe(true);
        expect(getMeshOverlapCacheStats(subject)).toEqual({
          preparedComponents: 2,
          pairVolumes: 1,
          invalidDiagnosticSets: 0,
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
          invalidDiagnosticHits: 0,
          invalidDiagnosticMisses: 0,
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
              nonManifoldEdges: 0,
              irregularEdgeKindCounts: { openBoundary: 6, nonManifold: 0 },
              irregularEdgeClusters: [],
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

  it(
    'should replay pair volumes from the persistent cache without rebuilding Manifolds (#1 lazy prepare)',
    { timeout: 10_000 },
    async () => {
      setGeoSpecEvidenceStore(createMemoryEvidenceStore());
      try {
        // Cold: empty persistent store, so the exact intersection runs and both
        // participant Manifolds are built.
        const coldProfile = createGeoSpecResourceScopeProfile();
        const coldScope = createGeoSpecResourceScope({ profile: coldProfile });
        const cold = twoBoxSubject(9);
        coldScope.trackSubject(cold);
        const coldResult = await analyzeMeshOverlap({ subject: cold, tolerance: 0.001 });
        await coldScope.dispose();
        expect(coldResult.success).toBe(true);
        if (!coldResult.success) {
          throw new Error(coldResult.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
        }
        expect(coldProfile.overlap.preparedComponentMisses).toBe(2);
        expect(coldProfile.overlap.pairVolumeMisses).toBe(1);

        // Warm: identical world-frame geometry but a brand-new subject (empty
        // in-run cache). The pair volume replays from the persistent peek keyed
        // on the participant content hashes, so NO Manifold is built — the
        // whole point of #1 (a warm interference sweep pays ~0 s of prepare).
        const warmProfile = createGeoSpecResourceScopeProfile();
        const warmScope = createGeoSpecResourceScope({ profile: warmProfile });
        const warm = twoBoxSubject(9);
        warmScope.trackSubject(warm);
        const warmResult = await analyzeMeshOverlap({ subject: warm, tolerance: 0.001 });
        await warmScope.dispose();
        expect(warmResult.success).toBe(true);
        if (!warmResult.success) {
          throw new Error(warmResult.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
        }
        expect(warmProfile.overlap.preparedComponentMisses).toBe(0);
        expect(warmProfile.overlap.pairVolumeHits).toBe(1);

        // Verdict parity: the cached (warm) evidence is byte-identical to cold.
        expect(warmResult.evidence.overlaps).toEqual(coldResult.evidence.overlaps);
        expect(warmResult.evidence.overlaps[0]?.intersectionVolume).toBe(
          coldResult.evidence.overlaps[0]?.intersectionVolume,
        );
      } finally {
        setGeoSpecEvidenceStore(undefined);
      }
    },
  );
});

describe('overlap pair-volume bundle (R6)', () => {
  it('should serve a repeat sweep from one bundle read with zero per-pair reads', async () => {
    const store = createMemoryEvidenceStore();
    let perPairGets = 0;
    let componentHashCalls = 0;
    const counting: GeoSpecEvidenceStore = {
      ...store,
      get: (family, keyDigest) => {
        if (family === 'overlap-pair-volume') {
          perPairGets += 1;
        }
        return store.get(family, keyDigest);
      },
      hashBytes: (bytes) => {
        componentHashCalls += 1;
        return store.hashBytes(bytes);
      },
    };
    setGeoSpecEvidenceStore(counting);
    try {
      // The bundle keys on the subject content hash; the synthetic overlap
      // subjects carry none, so give both runs the same one.
      const withHash = (subject: GeometrySubject): GeometrySubject => ({
        ...subject,
        provenance: { ...subject.provenance, contentHash: 'sha256:r6-bundle-fixture' },
      });

      const cold = await analyzeMeshOverlap({ subject: withHash(twoBoxSubject(9)), tolerance: 0.5 });
      expect(cold.success).toBe(true);
      const coldPerPairGets = perPairGets;
      // The cold sweep actually consulted the per-pair entries — otherwise the
      // warm assertion below would be vacuous.
      expect(coldPerPairGets).toBeGreaterThan(0);
      const coldComponentHashCalls = componentHashCalls;
      expect(coldComponentHashCalls).toBeGreaterThan(0);

      // A fresh subject object (new record, new in-memory cache) over the same
      // content: the sweep must answer every pair from the ONE bundle blob.
      const warm = await analyzeMeshOverlap({ subject: withHash(twoBoxSubject(9)), tolerance: 0.5 });

      expect(perPairGets).toBe(coldPerPairGets);
      expect(componentHashCalls).toBe(coldComponentHashCalls);
      expect(warm).toEqual(cold);
      if (cold.success && warm.success) {
        expect(warm.evidence.overlaps).toHaveLength(1);
      }
    } finally {
      setGeoSpecEvidenceStore(undefined);
    }
  });
});

describe('variance sweep axis and canonical pair order (R18/13e)', () => {
  it('should find the identical pair set on a colinear stack that defeats an x-only sweep', async () => {
    // Five boxes sharing one x-interval, stacked along y with only adjacent
    // neighbours overlapping: an x-only sweep cannot prune here (every box is
    // an x-candidate of every other), while the variance choice sweeps y.
    // Candidacy itself is the 3-axis AABB test, so the PAIR SET — and thus the
    // reported overlaps — must be exactly the adjacent neighbours.
    const stack = Array.from({ length: 5 }, (_unused, level) =>
      trianglesFromFlat(
        `level-${level}#0`,
        boxPositions.map((value, index) => (index % 3 === 1 ? value + level * 19 : value)),
        level * 12,
      ),
    ).flat();
    const subject = subjectFromTriangles(stack);

    const result = await analyzeMeshOverlap({ subject, tolerance: 0.5 });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    // 20-tall boxes every 19 units: exactly the 4 adjacent pairs interfere.
    expect(result.evidence.overlaps.map((overlap) => [overlap.leftComponentId, overlap.rightComponentId])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
  });

  it('should report overlaps in canonical component-id order regardless of geometry order', async () => {
    // Two overlapping pairs authored so the x-sweep would meet them in
    // reverse: the reported order must follow component ids, and each pair's
    // internal left/right must be the lower id.
    const subject = subjectFromTriangles([
      ...trianglesFromFlat(
        'a#0',
        boxPositions.map((value, index) => (index % 3 === 0 ? value + 100 : value)),
      ),
      ...trianglesFromFlat(
        'b#0',
        boxPositions.map((value, index) => (index % 3 === 0 ? value + 109 : value)),
        12,
      ),
      ...trianglesFromFlat('c#0', boxPositions, 24),
      ...trianglesFromFlat('d#0', shiftBox(9), 36),
    ]);

    const result = await analyzeMeshOverlap({ subject, tolerance: 0.5 });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.evidence.overlaps.map((overlap) => [overlap.leftComponentId, overlap.rightComponentId])).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });
});
