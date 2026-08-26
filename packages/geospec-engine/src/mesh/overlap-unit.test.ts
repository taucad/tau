import { describe, expect, it } from 'vitest';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import { analyzeMeshOverlap, getMeshOverlapCacheStats } from '#mesh/overlap.js';
import { boxSoup, subjectFromNamedSoups } from '#mesh/testing/overlap-subjects.js';
import { createGeoSpecResourceScopeProfile } from '#runner/profile.js';
import { createGeoSpecResourceScope } from '#runner/resource-scope.js';
import type { GeometrySubject } from '#mesh/types.js';

const threeBoxes = (): GeometrySubject =>
  subjectFromNamedSoups([
    { name: 'a', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
    { name: 'b', soup: boxSoup([5, 0, 0], [15, 10, 10]) },
    { name: 'c', soup: boxSoup([0, 5, 0], [10, 15, 10]) },
  ]);

describe('pair selectors', () => {
  it('should narrow the sweep to the selected pairs and record them', async () => {
    const result = await analyzeMeshOverlap({
      subject: threeBoxes(),
      tolerance: 0.5,
      pairs: [{ left: 'a', right: /^b$/ }],
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.evidence.selectedPairs).toEqual([{ leftLabel: 'a', rightLabel: 'b' }]);
    expect(result.evidence.checkedPairs).toBe(1);
    expect(result.evidence.overlaps.map((overlap) => [overlap.leftLabel, overlap.rightLabel])).toEqual([['a', 'b']]);
  });

  it('should match a selector in either direction', async () => {
    const result = await analyzeMeshOverlap({
      subject: threeBoxes(),
      tolerance: 0.5,
      pairs: [{ left: 'b', right: 'a' }],
    });

    expect(result.success && result.evidence.selectedPairs).toEqual([{ leftLabel: 'a', rightLabel: 'b' }]);
  });

  it('should never bundle a partial sweep', async () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    try {
      const subject: GeometrySubject = {
        ...threeBoxes(),
        provenance: { ...threeBoxes().provenance, contentHash: 'sha256:partial-sweep' },
      };
      await analyzeMeshOverlap({ subject, tolerance: 0.5, pairs: [{ left: 'a', right: 'b' }] });

      expect([...store.entries.keys()].some((key) => key.startsWith('overlap-pair-bundle'))).toBe(false);
    } finally {
      setGeoSpecEvidenceStore(undefined);
    }
  });

  it('should let the first bundle writer win', async () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    try {
      const contentHash = 'sha256:first-writer-wins';
      const withHash = (): GeometrySubject => {
        const subject = threeBoxes();
        return { ...subject, provenance: { ...subject.provenance, contentHash } };
      };
      await analyzeMeshOverlap({ subject: withHash(), tolerance: 0.5 });
      const bundleKeys = [...store.entries.keys()].filter((key) => key.startsWith('overlap-pair-bundle'));
      expect(bundleKeys).toHaveLength(1);
      const first = store.entries.get(bundleKeys[0]!)!;

      await analyzeMeshOverlap({ subject: withHash(), tolerance: 0.5 });

      expect(store.entries.get(bundleKeys[0]!)).toBe(first);
    } finally {
      setGeoSpecEvidenceStore(undefined);
    }
  });

  it('should tolerate a positive cached pair written without an optional witness', async () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    try {
      const withHash = (): GeometrySubject =>
        subjectFromNamedSoups(
          [
            { name: 'left', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
            { name: 'right', soup: boxSoup([5, 0, 0], [15, 10, 10]) },
          ],
          { contentHash: 'sha256:witnessless-pair' },
        );
      await analyzeMeshOverlap({ subject: withHash(), tolerance: 0.5 });
      for (const [key, bytes] of store.entries) {
        if (key.startsWith('overlap-pair-bundle:')) {
          store.entries.delete(key);
        }
        if (key.startsWith('overlap-pair-volume:')) {
          const { witnessPoint: _witnessPoint, ...payload } = JSON.parse(new TextDecoder().decode(bytes)) as {
            volume: number;
            witnessPoint?: unknown;
          };
          store.entries.set(key, new TextEncoder().encode(JSON.stringify(payload)));
        }
      }

      const replay = await analyzeMeshOverlap({ subject: withHash(), tolerance: 0.5 });
      expect(replay.success && replay.evidence.overlaps[0] && 'witnessPoint' in replay.evidence.overlaps[0]).toBe(
        false,
      );
    } finally {
      setGeoSpecEvidenceStore(undefined);
    }
  });
});

describe('component partitioning', () => {
  it('should refuse unnamed geometry rather than infer component identity from connectivity', async () => {
    const bare = subjectFromNamedSoups([
      { name: '  ', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
      { name: '  ', soup: boxSoup([20, 0, 0], [30, 10, 10]) },
    ]);
    const subject = {
      ...bare,
      provenance: { ...bare.provenance, contentHash: 'sha256:connected-partition' },
    };

    const result = await analyzeMeshOverlap({ subject, tolerance: 0.5 });

    expect(result).toMatchObject({
      success: false,
      diagnostics: [{ code: 'GEOSPEC_COMPONENT_PARTITION_INCONCLUSIVE' }],
    });
  });

  it('should refuse a single-component subject', async () => {
    const subject = subjectFromNamedSoups([{ name: 'solo', soup: boxSoup([0, 0, 0], [10, 10, 10]) }]);

    const result = await analyzeMeshOverlap({ subject });

    expect(result).toMatchObject({
      success: false,
      diagnostics: [{ code: 'GEOSPEC_COMPONENT_PARTITION_INCONCLUSIVE', details: { primitiveCount: 1 } }],
    });
  });
});

describe('per-subject cache lifetime', () => {
  it('should hold no cache after a standalone sweep and reuse one within a call', async () => {
    const subject = threeBoxes();

    const result = await analyzeMeshOverlap({ subject, tolerance: 0.5 });

    expect(result.success).toBe(true);
    expect(getMeshOverlapCacheStats(subject)).toBeUndefined();
  });

  it('should let the certified-disjoint prefilter decide a coarse-AABB candidate', async () => {
    const subject = subjectFromNamedSoups([
      { name: 'left', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
      { name: 'right', soup: boxSoup([10.1, 0, 0], [20.1, 10, 10]) },
    ]);
    const profile = createGeoSpecResourceScopeProfile();
    const scope = createGeoSpecResourceScope({ profile });
    scope.trackSubject(subject);
    try {
      const result = await analyzeMeshOverlap({ subject, tolerance: 0.5 });
      expect(result).toMatchObject({ success: true, evidence: { checkedPairs: 1, overlaps: [] } });
      expect(profile.overlap.prefilterProven).toBe(1);
    } finally {
      await scope.dispose();
    }
  });
});

describe('invalid component reporting', () => {
  it('should reuse the cached diagnostic set on a second sweep', async () => {
    const base = subjectFromNamedSoups([
      { name: 'open#0', soup: boxSoup([0, 0, 0], [10, 10, 10]).slice(0, 9) },
      { name: 'closed#0', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
    ]);
    const subject: GeometrySubject = {
      ...base,
      mesh: {
        ...base.mesh,
        stats: {
          ...base.mesh.stats,
          watertight: false,
          analyseWatertight: () => ({
            watertight: false,
            irregularEdges: 3,
            openBoundaryEdges: 3,
            nonManifoldEdges: 0,
            irregularEdgeKindCounts: { openBoundary: 3, nonManifold: 0 },
            irregularEdgeClusters: [],
            totalEdges: 3,
            irregularEdgeFraction: 1,
            perPrimitive: [
              { name: 'open#0', boundaryEdges: 3, loopCentroid: [0, 0, 0] },
              { name: 'closed#0', boundaryEdges: 0, loopCentroid: [0, 0, 0] },
            ],
          }),
        },
      },
    };

    // A scope keeps the per-subject cache alive across the two sweeps, so the
    // second one must replay the diagnostic set instead of rebuilding it.
    const profile = createGeoSpecResourceScopeProfile();
    const scope = createGeoSpecResourceScope({ profile });
    scope.trackSubject(subject);
    try {
      const first = await analyzeMeshOverlap({ subject, tolerance: 0.5 });
      const second = await analyzeMeshOverlap({ subject, tolerance: 0.5 });

      expect(first.success).toBe(false);
      expect(second.success).toBe(false);
      expect(first.diagnostics).toHaveLength(1);
      expect(first.diagnostics[0]?.details).toMatchObject({ label: 'open#0', triangleCount: 1, sourceDiagnostics: [] });
      expect(profile.overlap).toMatchObject({ invalidDiagnosticMisses: 1, invalidDiagnosticHits: 1 });
    } finally {
      await scope.dispose();
    }
  });

  it('should proceed when a non-watertight subject flags no component', async () => {
    const base = threeBoxes();
    const subject: GeometrySubject = {
      ...base,
      mesh: {
        ...base.mesh,
        stats: {
          ...base.mesh.stats,
          analyseWatertight: () => ({
            watertight: false,
            irregularEdges: 1,
            openBoundaryEdges: 1,
            nonManifoldEdges: 0,
            irregularEdgeKindCounts: { openBoundary: 1, nonManifold: 0 },
            irregularEdgeClusters: [],
            totalEdges: 10,
            irregularEdgeFraction: 0.1,
            perPrimitive: [],
          }),
        },
      },
    };

    const result = await analyzeMeshOverlap({ subject, tolerance: 0.5 });

    expect(result.success).toBe(true);
  });

  it('should keep only the diagnostics whose facet names the component', async () => {
    const base = subjectFromNamedSoups([
      { name: 'open#0', soup: boxSoup([0, 0, 0], [10, 10, 10]).slice(0, 9) },
      { name: 'closed#0', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
    ]);
    const subject: GeometrySubject = {
      ...base,
      diagnostics: [
        { code: 'UNRELATED', severity: 'warning', message: 'no details at all' },
        { code: 'UNRELATED', severity: 'warning', message: 'details without a facet', details: { other: 1 } },
        {
          code: 'GEOMETRY_INVALID',
          severity: 'warning',
          message: 'the open component',
          details: { facet: { partName: 'open#0' } },
        },
      ],
      mesh: {
        ...base.mesh,
        stats: {
          ...base.mesh.stats,
          analyseWatertight: () => ({
            watertight: false,
            irregularEdges: 3,
            openBoundaryEdges: 3,
            nonManifoldEdges: 0,
            irregularEdgeKindCounts: { openBoundary: 3, nonManifold: 0 },
            irregularEdgeClusters: [],
            totalEdges: 3,
            irregularEdgeFraction: 1,
            perPrimitive: [{ name: 'open#0', boundaryEdges: 3, loopCentroid: [0, 0, 0] }],
          }),
        },
      },
    };

    const result = await analyzeMeshOverlap({ subject, tolerance: 0.5 });

    expect(result.success).toBe(false);
    expect(result.diagnostics[0]?.details).toMatchObject({
      sourceDiagnostics: [{ code: 'GEOMETRY_INVALID' }],
    });
  });
});

describe('Manifold rejection', () => {
  const openTriangle = boxSoup([0, 0, 0], [10, 10, 10]).slice(0, 9);
  const closed = boxSoup([0, 0, 0], [10, 10, 10]);

  it('should report the rejected component whichever side of the pair it is', async () => {
    const leftBad = await analyzeMeshOverlap({
      subject: subjectFromNamedSoups([
        { name: 'open', soup: openTriangle },
        { name: 'closed', soup: closed },
      ]),
      tolerance: 0.5,
    });
    const rightBad = await analyzeMeshOverlap({
      subject: subjectFromNamedSoups([
        { name: 'closed', soup: closed },
        { name: 'open', soup: openTriangle },
      ]),
      tolerance: 0.5,
    });

    for (const result of [leftBad, rightBad]) {
      expect(result).toMatchObject({
        success: false,
        diagnostics: [{ code: 'GEOSPEC_MANIFOLD_COMPONENT_INVALID', details: { label: 'open', triangleCount: 1 } }],
      });
    }
  });
});

describe('component colours and candidate pruning', () => {
  it('should carry primitive colours onto the overlap evidence', async () => {
    const base = subjectFromNamedSoups([
      { name: 'left', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
      { name: 'right', soup: boxSoup([5, 0, 0], [15, 10, 10]) },
    ]);
    const subject: GeometrySubject = {
      ...base,
      mesh: {
        ...base.mesh,
        stats: {
          ...base.mesh.stats,
          boundingBox: {
            size: [15, 10, 10],
            center: [7.5, 5, 5],
            primitives: [
              { name: 'left', vertices: 36, aabb: { min: [0, 0, 0], max: [10, 10, 10] }, color: '#ff0000' },
              { name: 'right', vertices: 36, aabb: { min: [5, 0, 0], max: [15, 10, 10] }, color: '#00ff00' },
            ],
          },
        },
      },
    };

    const result = await analyzeMeshOverlap({ subject, tolerance: 0.5 });

    expect(result.success && result.evidence.overlaps[0]).toMatchObject({
      leftColor: '#ff0000',
      rightColor: '#00ff00',
    });

    // A primitive without a colour contributes none, and the overlap omits it.
    const uncoloured = await analyzeMeshOverlap({
      subject: {
        ...subject,
        mesh: {
          ...subject.mesh,
          stats: {
            ...subject.mesh.stats,
            boundingBox: {
              ...subject.mesh.stats.boundingBox!,
              primitives: subject.mesh.stats.boundingBox!.primitives.map(({ color: _color, ...rest }) => rest),
            },
          },
        },
      },
      tolerance: 0.5,
    });
    expect(
      uncoloured.success && uncoloured.evidence.overlaps[0] && 'leftColor' in uncoloured.evidence.overlaps[0],
    ).toBe(false);
  });

  it('should reject a sweep candidate that misses on another axis', async () => {
    // Sweeping x (the axis of greatest centre variance), `far` keeps the scan
    // alive past `high`, whose y interval clears `low` entirely.
    const subject = subjectFromNamedSoups([
      { name: 'low', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
      { name: 'high', soup: boxSoup([5, 50, 0], [15, 60, 10]) },
      { name: 'far', soup: boxSoup([200, 0, 0], [210, 10, 10]) },
    ]);

    const result = await analyzeMeshOverlap({ subject, tolerance: 0.5 });

    expect(result.success && result.evidence.checkedPairs).toBe(0);
  });
});

describe('bundled pairs without a witness', () => {
  it('should replay a zero-volume pair from the bundle', async () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    try {
      const touching = (): GeometrySubject => {
        const subject = subjectFromNamedSoups([
          { name: 'left', soup: boxSoup([0, 0, 0], [10, 10, 10]) },
          { name: 'right', soup: boxSoup([10, 0, 0], [20, 10, 10]) },
        ]);
        return { ...subject, provenance: { ...subject.provenance, contentHash: 'sha256:touching-bundle' } };
      };
      const cold = await analyzeMeshOverlap({ subject: touching(), tolerance: 0.5 });
      const warm = await analyzeMeshOverlap({ subject: touching(), tolerance: 0.5 });

      expect(cold.success && cold.evidence.overlaps).toEqual([]);
      expect(warm).toEqual(cold);
    } finally {
      setGeoSpecEvidenceStore(undefined);
    }
  });
});
