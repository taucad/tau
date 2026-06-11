import { describe, expect, it } from 'vitest';
import {
  containedBoxFixture,
  disjointBoxesFixture,
  manifoldVolumeCandidate,
  manyPartSparseGridFixture,
  openBoundaryFixture,
  opencascadeBaselineCandidate,
  overlappingBoxesFixture,
  tangentBoxesFixture,
  threeMeshBvhRelationCandidate,
} from '#experiments/overlap-backends/index.js';
import type {
  OverlapBackendCandidate,
  OverlapExperimentResult,
  OverlapFixture,
  PreparedOverlapExperiment,
} from '#experiments/overlap-backends/index.js';

const runCandidate = async <Prepared extends PreparedOverlapExperiment>(
  backend: OverlapBackendCandidate<Prepared>,
  fixture: OverlapFixture,
  tolerance = 0.001,
): Promise<OverlapExperimentResult> => {
  const subject = await fixture.loadSubject();
  const prepared = await backend.prepare(subject);
  try {
    return await backend.analyze(prepared, { tolerance });
  } finally {
    await backend.dispose?.(prepared);
  }
};

describe('overlap backend PoC harness', () => {
  it('should report exact Manifold volumes for analytic positive-overlap fixtures', async () => {
    const overlap = await runCandidate(manifoldVolumeCandidate, overlappingBoxesFixture);
    const contained = await runCandidate(manifoldVolumeCandidate, containedBoxFixture);

    expect(overlap).toMatchObject({
      success: true,
      backend: 'manifold-exact-volume',
      componentCount: 2,
      pairCount: 1,
      exactVolumePairs: 1,
      overlapCount: 1,
    });
    expect(overlap.overlaps[0]).toMatchObject({
      leftLabel: 'left-box#0',
      rightLabel: 'right-box#0',
      backend: 'manifold-exact-volume',
    });
    expect(overlap.overlaps[0]?.intersectionVolume).toBeCloseTo(600, 6);

    expect(contained).toMatchObject({
      success: true,
      exactVolumePairs: 1,
      overlapCount: 1,
    });
    expect(contained.overlaps[0]).toMatchObject({
      leftLabel: 'outer-box#0',
      rightLabel: 'inner-box#0',
    });
    expect(contained.overlaps[0]?.intersectionVolume).toBeCloseTo(8, 6);
  });

  it('should keep disjoint and tangent Manifold fixtures at zero positive-volume overlap', async () => {
    const disjoint = await runCandidate(manifoldVolumeCandidate, disjointBoxesFixture);
    const tangent = await runCandidate(manifoldVolumeCandidate, tangentBoxesFixture);

    expect(disjoint).toMatchObject({
      success: true,
      aabbCandidatePairs: 0,
      exactVolumePairs: 0,
      overlapCount: 0,
      overlaps: [],
    });
    expect(tangent).toMatchObject({
      success: true,
      aabbCandidatePairs: 1,
      exactVolumePairs: 1,
      overlapCount: 0,
      overlaps: [],
    });
  });

  it('should prove BVH relation pruning on a many-part sparse assembly without exact-volume calls', async () => {
    const result = await runCandidate(threeMeshBvhRelationCandidate, manyPartSparseGridFixture());

    expect(result).toMatchObject({
      success: true,
      backend: 'three-mesh-bvh-relation',
      componentCount: 100,
      pairCount: 4950,
      aabbCandidatePairs: 0,
      relationCandidatePairs: 0,
      exactVolumePairs: 0,
      overlapCount: 0,
    });
  });

  it('should surface Manifold component invalidity as structured diagnostics', async () => {
    const result = await runCandidate(manifoldVolumeCandidate, openBoundaryFixture);

    expect(result.success).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    const diagnostic = result.diagnostics[0]!;
    expect(diagnostic.code).toBe('GEOSPEC_POC_MANIFOLD_COMPONENT_INVALID');
    expect(diagnostic.severity).toBe('error');
    expect(diagnostic.spatial).toEqual({
      min: [0, 0, 0],
      max: [10, 10, 0],
      center: [5, 5, 0],
    });
    expect(diagnostic.details).toMatchObject({
      label: 'open-square#0',
      triangleCount: 2,
    });
  });

  it(
    'should adapt the existing OpenCascade baseline analyzer into the PoC result shape',
    { timeout: 30_000 },
    async () => {
      const result = await runCandidate(opencascadeBaselineCandidate, overlappingBoxesFixture);

      expect(result).toMatchObject({
        success: true,
        backend: 'opencascade-all-pairs-baseline',
        componentCount: 2,
        pairCount: 1,
        exactVolumePairs: 1,
        overlapCount: 1,
      });
      expect(result.overlaps[0]?.intersectionVolume).toBeCloseTo(600, 2);
      expect(result.overlaps[0]?.witnessPoint?.every((coordinate) => Number.isFinite(coordinate))).toBe(true);
    },
  );
});
