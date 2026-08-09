import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureManifoldModule } from '#mesh/manifold-module.js';
import type { GeometrySubject } from '#mesh/types.js';
import { loadStep } from '#step/index.js';
import { getSubjectProofContext } from '#proofs/index.js';
import type { RelationshipProofContext } from '#proofs/index.js';
import { closedCellsForOccurrence, proveVoidContinuity } from '#proofs/void-continuity.js';
import { computeVoidMeshOccupancy, mergeAscendingCells } from '#proofs/void-occupancy.js';
import { withMatcherBudget } from '#runner/matcher-budget.js';

/**
 * Hybrid void-occupancy equivalence harness (throughput blueprint R6 move 3).
 *
 * The hybrid engine's whole safety contract is per-cell EXACT-EQUIVALENCE:
 * the closed set it computes (mesh-decided bulk + exactly classified band)
 * must be bit-identical to the pure exact scan on the same claim, so every
 * downstream verdict, witness, and cached evidence value is unchanged. This
 * suite proves it on real STEP fixtures through the real native backend —
 * no mocks of the system under test — and locks the fallback and gating
 * behaviour that keeps engine choice deterministic (geospec-policy §16).
 */

const fixture = (relative: string): string => join(import.meta.dirname, '../../fixtures', relative);

// Fixture valve-stem-guide: 20x20x45 box with an r4.03 through-bore along +Z
// — one curved wall (band exercise) + planar walls, small enough that a full
// exact reference scan stays fast. Fixture filter-inside-housing: open cup
// with a blind r27 cavity and a 3 mm floor — concave, multi-band geometry.
const guidePath = fixture('containment/valve-stem-guide-positive/model.step');
const housingPath = fixture('containment/filter-inside-housing-positive/model.step');

type TestGrid = { origin: [number, number, number]; resolution: number; dims: [number, number, number] };

/** Grid mirroring the claim builder in proveVoidContinuity for one region. */
const gridForBounds = (
  bounds: { min: readonly [number, number, number]; max: readonly [number, number, number] },
  resolution: number,
): TestGrid => ({
  origin: [bounds.min[0], bounds.min[1], bounds.min[2]],
  resolution,
  dims: [
    Math.max(1, Math.ceil((bounds.max[0] - bounds.min[0]) / resolution)),
    Math.max(1, Math.ceil((bounds.max[1] - bounds.min[1]) / resolution)),
    Math.max(1, Math.ceil((bounds.max[2] - bounds.min[2]) / resolution)),
  ],
});

const wholeGridRange = (grid: TestGrid) => ({
  x0: 0,
  x1: grid.dims[0] - 1,
  y0: 0,
  y1: grid.dims[1] - 1,
  z0: 0,
  z1: grid.dims[2] - 1,
});

// One-resolution-step inflated part AABBs (mirrors materialBounds).
const guideRegion = { min: [-10.5, -10.5, -0.5] as const, max: [10.5, 10.5, 45.5] as const };
const housingRegion = { min: [-30.5, -30.5, -0.5] as const, max: [30.5, 30.5, 60.5] as const };

/** Flat 12-triangle soup of an axis-aligned box (9 floats per triangle). */
const boxTriangles = (min: readonly [number, number, number], max: readonly [number, number, number]): number[] => {
  const corners: ReadonlyArray<readonly [number, number, number]> = [
    [min[0], min[1], min[2]],
    [max[0], min[1], min[2]],
    [max[0], max[1], min[2]],
    [min[0], max[1], min[2]],
    [min[0], min[1], max[2]],
    [max[0], min[1], max[2]],
    [max[0], max[1], max[2]],
    [min[0], max[1], max[2]],
  ];
  const faces: ReadonlyArray<readonly [number, number, number]> = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 6],
    [1, 6, 5],
    [2, 3, 7],
    [2, 7, 6],
    [3, 0, 4],
    [3, 4, 7],
  ];
  return faces.flatMap(([a, b, c]) => [...corners[a]!, ...corners[b]!, ...corners[c]!]);
};

describe('CR8 layer sweep — degenerate geometry (synthetic)', () => {
  beforeAll(async () => {
    // The occupancy engine resolves Manifold synchronously; synthetic tests
    // must preload it the way loadStep does for STEP subjects.
    await ensureManifoldModule();
  });

  // Grid planes at z = 0, 1, 2, 3 and cell centres on integer coordinates:
  // the box faces at z = 0 and z = 2 lie EXACTLY on layer planes, and every
  // box vertex sits exactly on a plane — the half-open sweep cases.
  const grid = {
    origin: [-0.5, -0.5, -0.5] as [number, number, number],
    resolution: 1,
    dims: [5, 5, 4] as [number, number, number],
  };
  const range = wholeGridRange(grid);
  const occupancy = (soup: number[]) =>
    computeVoidMeshOccupancy({
      grid,
      range,
      fetchMesh: () => ({ triangles: new Float64Array(soup), deflection: 0.01 }),
    });

  it('should fill only strictly-interior cells when faces and vertices lie on layer planes', () => {
    const result = occupancy(boxTriangles([0, 0, 0], [4, 4, 2]));
    expect('fallback' in result).toBe(false);
    if ('fallback' in result) {
      return;
    }
    // The only non-band inside centres are the 9 xy-interior cells on the
    // z = 1 layer; the coplanar faces at z = 0 and z = 2 contribute no
    // crossings (half-open) and their cells are band cells by construction.
    const expected: number[] = [];
    for (const iy of [1, 2, 3]) {
      for (const ix of [1, 2, 3]) {
        expected.push((grid.dims[1] + iy) * grid.dims[0] + ix);
      }
    }
    expect(result.meshClosed).toEqual(expected);
    expect(result.bandCells.length).toBeGreaterThan(0);
  });

  it('should fill a single-layer slab and leave empty layers untouched', () => {
    const result = occupancy(boxTriangles([0, 0, 0.9], [4, 4, 1.1]));
    expect('fallback' in result).toBe(false);
    if ('fallback' in result) {
      return;
    }
    const layerOf = (cell: number): number => Math.floor(cell / (grid.dims[0] * grid.dims[1]));
    expect(result.meshClosed.length).toBeGreaterThan(0);
    expect(new Set(result.meshClosed.map(layerOf))).toEqual(new Set([1]));
  });
});

const runWithVoidEngine = <T>(engine: 'exact' | undefined, run: () => T): T => {
  const previous = process.env['GEOSPEC_VOID_ENGINE'];
  if (engine === undefined) {
    delete process.env['GEOSPEC_VOID_ENGINE'];
  } else {
    process.env['GEOSPEC_VOID_ENGINE'] = engine;
  }
  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env['GEOSPEC_VOID_ENGINE'];
    } else {
      process.env['GEOSPEC_VOID_ENGINE'] = previous;
    }
  }
};

const runWithUnitBudget = <T>(budget: string, run: () => T): T => {
  const previous = process.env['GEOSPEC_MATCHER_UNIT_BUDGET'];
  process.env['GEOSPEC_MATCHER_UNIT_BUDGET'] = budget;
  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env['GEOSPEC_MATCHER_UNIT_BUDGET'];
    } else {
      process.env['GEOSPEC_MATCHER_UNIT_BUDGET'] = previous;
    }
  }
};

describe('hybrid void occupancy (native fixtures)', () => {
  let guide: GeometrySubject;
  let guideContext: RelationshipProofContext;
  let housing: GeometrySubject;
  let housingContext: RelationshipProofContext;

  beforeAll(async () => {
    guide = await loadStep({ source: guidePath, name: 'valve-stem-guide' });
    housing = await loadStep({ source: housingPath, name: 'filter-inside-housing' });
    const guideBuilt = getSubjectProofContext(guide);
    const housingBuilt = getSubjectProofContext(housing);
    if (!guideBuilt || !housingBuilt) {
      throw new Error('void-occupancy fixtures must carry STEP-XDE and native BRep evidence.');
    }
    guideContext = guideBuilt;
    housingContext = housingBuilt;
  }, 120_000);

  afterAll(() => {
    guide.nativeXde?.delete?.();
    housing.nativeXde?.delete?.();
  });

  // Budget-free direct calls: chargeBudget no-ops without an active budget,
  // so the engine seam is exercised exactly as the proof path would, minus
  // the (separately tested) exhaustion conversion.
  const closedCells = (context: RelationshipProofContext, grid: TestGrid): number[] => {
    const result = closedCellsForOccurrence({ context, grid, occurrence: 0, bounds: undefined });
    if ('error' in result) {
      throw new Error(result.error);
    }
    return result.closed;
  };

  it('computes hybrid closed cells bit-identical to the pure exact scan (guide, curved bore)', () => {
    // Resolution 0.5 puts the range at 42x42x92 ~= 162k cells — above the
    // hybrid gate, still an affordable exact reference scan.
    const grid = gridForBounds(guideRegion, 0.5);
    const exact = runWithVoidEngine('exact', () => closedCells(guideContext, grid));
    const hybrid = runWithVoidEngine(undefined, () => closedCells(guideContext, grid));
    expect(hybrid.length).toBeGreaterThan(0);
    expect(hybrid).toEqual(exact);
  }, 300_000);

  it('computes hybrid closed cells bit-identical to the pure exact scan (housing, blind cavity)', () => {
    const grid = gridForBounds(housingRegion, 0.5);
    const exact = runWithVoidEngine('exact', () => closedCells(housingContext, grid));
    const hybrid = runWithVoidEngine(undefined, () => closedCells(housingContext, grid));
    expect(hybrid.length).toBeGreaterThan(0);
    expect(hybrid).toEqual(exact);
  }, 300_000);

  it('actually takes the mesh path: non-trivial band/bulk split with the bulk mesh-decided', () => {
    const grid = gridForBounds(guideRegion, 0.5);
    const fetchOccurrenceMesh = guideContext.occurrenceMesh;
    expect(fetchOccurrenceMesh).toBeDefined();
    // Force a COARSE tessellation so the exactness band is guaranteed several
    // cells wide — this test proves the split MECHANISM populates both streams.
    // (At the production sub-0.1 mm deflection the band on this small
    // axis-aligned fixture is legitimately near-empty — the equivalence tests
    // above prove that near-empty band stays bit-identical to exact.)
    const coarseDeflection = 0.5;
    const result = computeVoidMeshOccupancy({
      grid,
      range: wholeGridRange(grid),
      fetchMesh: () => fetchOccurrenceMesh!(0, { linearDeflection: coarseDeflection, angularDeflectionDegrees: 15 }),
    });
    if ('fallback' in result) {
      throw new Error(`expected the hybrid path, got fallback: ${result.fallback}`);
    }
    const rangeCells = grid.dims[0] * grid.dims[1] * grid.dims[2];
    expect(result.triangleCount).toBeGreaterThan(0);
    // The band is a surface shell: a strict minority of the range.
    expect(result.bandCells.length).toBeGreaterThan(0);
    expect(result.bandCells.length).toBeLessThan(rangeCells / 2);
    // The mesh decided real material bulk without exact classification.
    expect(result.meshClosed.length).toBeGreaterThan(0);
    // Deflection honoured the request floor and the band covers it.
    expect(result.deflection).toBeGreaterThanOrEqual(coarseDeflection);
    expect(result.band).toBeGreaterThanOrEqual(2 * result.deflection);
    // Streams are ascending and disjoint — merge-ready.
    const merged = mergeAscendingCells(result.meshClosed, result.bandCells);
    expect(merged.length).toBe(result.meshClosed.length + result.bandCells.length);
    for (let index = 1; index < merged.length; index += 1) {
      expect(merged[index]!).toBeGreaterThan(merged[index - 1]!);
    }
  }, 120_000);

  it('is deterministic: two hybrid computations are bit-identical', () => {
    const grid = gridForBounds(guideRegion, 0.5);
    const first = closedCells(guideContext, grid);
    const second = closedCells(guideContext, grid);
    expect(second).toEqual(first);
  }, 300_000);

  it('falls back to the exact engine on a non-manifold tessellation, never guessing', () => {
    const grid = gridForBounds(guideRegion, 0.5);
    const result = computeVoidMeshOccupancy({
      grid,
      range: wholeGridRange(grid),
      // One lone triangle: heals to nothing watertight.
      fetchMesh: () => ({ triangles: new Float64Array([0, 0, 0, 10, 0, 0, 0, 10, 0]), deflection: 0.1 }),
    });
    expect('fallback' in result && result.fallback).toMatch(/manifold/u);
  });

  it('falls back when the occurrence tessellation reports a native error', () => {
    const grid = gridForBounds(guideRegion, 0.5);
    const result = computeVoidMeshOccupancy({
      grid,
      range: wholeGridRange(grid),
      fetchMesh: () => ({ error: 'occurrence index 99 is out of range' }),
    });
    expect('fallback' in result && result.fallback).toContain('occurrence index 99');
  });

  it('fails bounded with MATCHER_TIMEOUT when the unit budget is exhausted on the hybrid path', () => {
    const grid = gridForBounds(guideRegion, 0.5);
    const diagnostics = runWithUnitBudget('100', () =>
      withMatcherBudget('voidContinuity', () => {
        const result = closedCellsForOccurrence({ context: guideContext, grid, occurrence: 0, bounds: undefined });
        if ('error' in result) {
          throw new Error(result.error);
        }
        return [];
      }),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('MATCHER_TIMEOUT');
  }, 60_000);

  // Fresh subject per engine run: proveVoidContinuity memoizes closed cells
  // per native handle (occupancyCache), so an env-flip on ONE context would
  // vacuously replay the first engine's cells instead of comparing engines.
  const proveOnFreshGuide = async (
    engine: 'exact' | undefined,
    expectation: Parameters<typeof proveVoidContinuity>[0],
  ) => {
    const subject = await loadStep({ source: guidePath, name: 'valve-stem-guide' });
    try {
      const context = getSubjectProofContext(subject);
      if (!context) {
        throw new Error('guide fixture must carry native BRep evidence.');
      }
      return runWithVoidEngine(engine, () => proveVoidContinuity(expectation, context));
    } finally {
      subject.nativeXde?.delete?.();
    }
  };

  it('keeps sub-gate ranges on the exact path (deterministic engine choice)', async () => {
    // Pin the gate above the guide's ~22k-cell resolution-1 range so it routes
    // sub-gate. The proof must behave identically with the hybrid engine
    // available or force-disabled, because the gate keeps both on the exact
    // scan (a small lane on a light part is cheaper exact than tessellated).
    const expectation = {
      path: [[0, 0, 3] as [number, number, number], [0, 0, 42] as [number, number, number]],
      material: ['guide'],
      resolution: 1,
    };
    const previousGate = process.env['GEOSPEC_VOID_HYBRID_MIN_CELLS'];
    process.env['GEOSPEC_VOID_HYBRID_MIN_CELLS'] = '1000000';
    try {
      const forced = await proveOnFreshGuide('exact', expectation);
      const routed = await proveOnFreshGuide(undefined, expectation);
      expect(routed).toEqual(forced);
      expect(routed).toEqual([]);
    } finally {
      if (previousGate === undefined) {
        delete process.env['GEOSPEC_VOID_HYBRID_MIN_CELLS'];
      } else {
        process.env['GEOSPEC_VOID_HYBRID_MIN_CELLS'] = previousGate;
      }
    }
  }, 120_000);

  it('produces identical verdict diagnostics under both engines above the gate', async () => {
    // Above-gate claim exercising connectivity + cross-section wording: the
    // bore is one connected void with an exact section of ~51 mm² — claim a
    // larger minimum so BOTH engines must fail with the same message.
    const expectation = {
      path: [[0, 0, 3] as [number, number, number], [0, 0, 42] as [number, number, number]],
      material: ['guide'],
      resolution: 0.5,
      minCrossSection: 200,
    };
    const exact = await proveOnFreshGuide('exact', expectation);
    const hybrid = await proveOnFreshGuide(undefined, expectation);
    expect(hybrid).toEqual(exact);
    expect(hybrid).toHaveLength(1);
    expect(hybrid[0]?.code).toBe('GEOSPEC_VOID_CONTINUITY_MISMATCH');
  }, 300_000);
});
