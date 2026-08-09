import { describe, expect, it } from 'vitest';
import { boxSoup } from '#mesh/testing/overlap-subjects.js';
import type { Vec3 } from '#mesh/types.js';
import { buildMeshDistanceData, meshWithinDistance, meshesFartherThan } from '#proofs/mesh-distance-predicates.js';

const dataOf = (values: number[]): ReturnType<typeof buildMeshDistanceData> =>
  buildMeshDistanceData(new Float64Array(values));

/** A tiny subject triangle whose FIRST vertex is the probe point. */
const probeFrom = (point: Vec3): ReturnType<typeof buildMeshDistanceData> =>
  dataOf([...point, point[0] + 1e-3, point[1], point[2], point[0], point[1] + 1e-3, point[2]]);

const expectVec = (actual: Vec3 | undefined, expected: Vec3): void => {
  expect(actual).toBeDefined();
  for (let axis = 0; axis < 3; axis += 1) {
    expect(actual![axis]).toBeCloseTo(expected[axis]!, 6);
  }
};

describe('meshesFartherThan (certified separation at a threshold)', () => {
  const left = dataOf(boxSoup([0, 0, 0], [10, 10, 10]));
  const right = dataOf(boxSoup([11, 0, 0], [21, 10, 10]));

  it('should certify thresholds below the true gap and refuse ones above it', () => {
    expect(meshesFartherThan(left, right, 0.5)).toBe(true);
    expect(meshesFartherThan(left, right, 2)).toBe(false);
  });

  it('should certify an empty mesh vacuously', () => {
    expect(meshesFartherThan(dataOf([]), right, 1)).toBe(true);
  });

  it('should refuse when the traversal budget is exhausted before a proof', () => {
    // Forty coincident diagonal triangles per side: fat AABBs overlap (no box
    // pruning) while the parallel planes clear the margin (every leaf
    // certificate passes, so the traversal keeps going) — the single-pair
    // control proves the certificate holds, so the 40×40 refusal is the
    // deterministic budget, not a leaf failure.
    const diagonal = [0, 0, 0, 1, 1, 0, 0.5, 0.5, 1];
    const offset = diagonal.map((value, index) =>
      index % 3 === 0 ? value + 0.5 : index % 3 === 1 ? value - 0.5 : value,
    );
    expect(meshesFartherThan(dataOf(diagonal), dataOf(offset), 0.5)).toBe(true);
    const stackA = Array.from({ length: 40 }, () => diagonal).flat();
    const stackB = Array.from({ length: 40 }, () => offset).flat();
    expect(meshesFartherThan(dataOf(stackA), dataOf(stackB), 0.5)).toBe(false);
  });
});

describe('meshWithinDistance (realizable witness pairs)', () => {
  const target = dataOf(boxSoup([11, 0, 0], [21, 10, 10]));

  it('should realize a vertex-to-face pair across the gap', () => {
    const subject = dataOf(boxSoup([0, 0, 0], [10, 10, 10]));
    const witness = meshWithinDistance(subject, target, 1.5);
    expect(witness).toBeDefined();
    expect(witness!.distance).toBeCloseTo(1, 9);
    expect(witness!.subjectPoint[0]).toBe(10);
    expect(witness!.targetPoint[0]).toBeCloseTo(11, 9);
  });

  it('should find nothing below the true gap', () => {
    const subject = dataOf(boxSoup([0, 0, 0], [10, 10, 10]));
    expect(meshWithinDistance(subject, target, 0.5)).toBeUndefined();
  });

  it('should return nothing for an empty mesh', () => {
    expect(meshWithinDistance(dataOf([]), target, 1)).toBeUndefined();
    expect(meshWithinDistance(target, dataOf([]), 1)).toBeUndefined();
  });

  it('should abort to the straddle path when the visit budget is exhausted', () => {
    // Forty identical stacked target triangles defeat box pruning (all boxes
    // equal, within the 0.7 threshold of every probe) while every
    // closest-point distance (~0.99) stays above it, so the scan pays the
    // full ~79 nodes per probe vertex; forty subject triangles put 120 probes
    // through it — beyond the 64·(40+40) budget.
    const targetTriangle = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    const stacked = Array.from({ length: 40 }, () => targetTriangle).flat();
    // A tiny probe triangle keeps ALL its vertices within the box threshold,
    // so no probe prunes at the root.
    const probeTriangle = [1.4, 1.4, 0, 1.41, 1.4, 0, 1.4, 1.41, 0];
    const probes = Array.from({ length: 40 }, () => probeTriangle).flat();
    expect(meshWithinDistance(dataOf(probes), dataOf(stacked), 0.7)).toBeUndefined();
  });
});

describe('closest-point witness across every Voronoi region', () => {
  // Target triangle A(0,0,0) B(1,0,0) C(0,1,0); each probe exercises one
  // region of the Ericson classifier through the witness's target point.
  const target = dataOf([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const cases: Array<{ name: string; probe: Vec3; closest: Vec3 }> = [
    { name: 'vertex A', probe: [-1, -1, 0], closest: [0, 0, 0] },
    { name: 'vertex B', probe: [2, -0.5, 0], closest: [1, 0, 0] },
    { name: 'vertex C', probe: [-0.5, 2, 0], closest: [0, 1, 0] },
    { name: 'edge AB', probe: [0.5, -1, 0], closest: [0.5, 0, 0] },
    { name: 'edge AC', probe: [-1, 0.5, 0], closest: [0, 0.5, 0] },
    { name: 'edge BC', probe: [1, 1, 0], closest: [0.5, 0.5, 0] },
    { name: 'face interior', probe: [0.25, 0.25, 1], closest: [0.25, 0.25, 0] },
  ];

  for (const { name, probe, closest } of cases) {
    it(`should project onto the ${name} region`, () => {
      const witness = meshWithinDistance(probeFrom(probe), target, 10);
      expectVec(witness?.targetPoint, closest);
    });
  }

  it('should still project onto a degenerate (colinear) target via the edge regions', () => {
    const degenerate = dataOf([0, 0, 0, 1, 0, 0, 2, 0, 0]);
    expectVec(meshWithinDistance(probeFrom([3, 1, 0]), degenerate, 10)?.targetPoint, [2, 0, 0]);
    expectVec(meshWithinDistance(probeFrom([-1, 1, 0]), degenerate, 10)?.targetPoint, [0, 0, 0]);
    expectVec(meshWithinDistance(probeFrom([1.4, 1, 0]), degenerate, 10)?.targetPoint, [1.4, 0, 0]);
  });
});
