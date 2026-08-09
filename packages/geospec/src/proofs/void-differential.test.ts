import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GeometryDiagnostic, GeometrySubject } from '#mesh/types.js';
import type { GeoSpecVoidContinuityExpectation } from '#runner/types.js';
import { loadStep } from '#step/index.js';
import { getSubjectProofContext } from '#proofs/index.js';
import type { RelationshipProofContext } from '#proofs/index.js';
import { proveVoidContinuity } from '#proofs/void-continuity.js';

/**
 * The void verdict-model sign-off: every verdict-bearing claim from the
 * void-continuity corpus is run through the voxel engine (default) AND the
 * topological engine (`GEOSPEC_VOID_ENGINE=topological`), and their verdicts are
 * compared. Connectivity / isolation / setup must AGREE exactly (V3 made them
 * sound). Cross-section may legitimately differ where the voxel engine refuses a
 * claim its quantization cannot bound but the continuous mesh section can decide
 * — those divergences are asserted in their expected direction, not silently
 * tolerated.
 */
const fixture = (relative: string): string => join(import.meta.dirname, '../../fixtures', relative);
const guidePath = fixture('containment/valve-stem-guide-positive/model.step');
const housingPath = fixture('containment/filter-inside-housing-positive/model.step');
const housingBlockBounds = { min: [-15, -15, -6] as const, max: [15, 15, 62] as const };

const withEngine = <T>(engine: string | undefined, run: () => T): T => {
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

type Verdict = 'pass' | 'fail' | 'unsupported';
const verdict = (diagnostics: GeometryDiagnostic[]): Verdict => {
  const first = diagnostics[0];
  if (!first) {
    return 'pass';
  }
  return first.code === 'GEOSPEC_VOID_CONTINUITY_MISMATCH' ? 'fail' : 'unsupported';
};

type Category = 'connectivity' | 'isolation' | 'setup' | 'cross-section' | 'cross-section-quantized';
type Claim = {
  name: string;
  category: Category;
  fixture: 'guide' | 'housing';
  expectation: GeoSpecVoidContinuityExpectation;
};

const claims: Claim[] = [
  {
    name: 'through-void connected',
    category: 'connectivity',
    fixture: 'guide',
    expectation: {
      path: [
        [0, 0, 3],
        [0, 0, 42],
      ],
      material: ['guide'],
      resolution: 1,
    },
  },
  {
    name: 'path broken across floor',
    category: 'connectivity',
    fixture: 'housing',
    expectation: {
      path: [
        [0, 0, 30],
        [0, 0, -3],
      ],
      material: ['housing'],
      resolution: 2,
      bounds: housingBlockBounds,
    },
  },
  {
    name: 'waypoint buried in floor',
    category: 'connectivity',
    fixture: 'housing',
    expectation: {
      path: [
        [0, 0, 30],
        [0, 0, 1.5],
      ],
      material: ['housing'],
      resolution: 2,
      bounds: housingBlockBounds,
    },
  },
  {
    name: 'material derived from bounds → buried',
    category: 'connectivity',
    fixture: 'housing',
    expectation: {
      path: [
        [0, 0, 10],
        [0, 0, 55],
      ],
      resolution: 2,
      bounds: housingBlockBounds,
    },
  },
  {
    name: 'explicit housing-only open',
    category: 'connectivity',
    fixture: 'housing',
    expectation: {
      path: [
        [0, 0, 10],
        [0, 0, 55],
      ],
      material: ['housing'],
      resolution: 2,
      bounds: housingBlockBounds,
    },
  },
  {
    name: 'isolation holds across floor',
    category: 'isolation',
    fixture: 'housing',
    expectation: {
      path: [
        [0, 0, 10],
        [0, 0, 55],
      ],
      material: ['housing'],
      resolution: 2,
      isolatedFrom: [[0, 0, -3]],
      bounds: housingBlockBounds,
    },
  },
  {
    name: 'isolation breached in cavity',
    category: 'isolation',
    fixture: 'housing',
    expectation: {
      path: [
        [0, 0, 10],
        [0, 0, 55],
      ],
      material: ['housing'],
      resolution: 2,
      isolatedFrom: [[0, 0, 35]],
      bounds: housingBlockBounds,
    },
  },
  {
    name: 'isolatedFrom probe in material',
    category: 'isolation',
    fixture: 'housing',
    expectation: {
      path: [
        [0, 0, 10],
        [0, 0, 55],
      ],
      material: ['housing'],
      resolution: 2,
      isolatedFrom: [[0, 0, 1.5]],
      bounds: housingBlockBounds,
    },
  },
  {
    name: 'neither material nor bounds',
    category: 'setup',
    fixture: 'housing',
    expectation: {
      path: [
        [0, 0, 10],
        [0, 0, 55],
      ],
    },
  },
  {
    name: 'cross-section wide (40)',
    category: 'cross-section',
    fixture: 'guide',
    expectation: {
      path: [
        [0, 0, 5],
        [0, 0, 40],
      ],
      material: ['guide'],
      resolution: 1,
      minCrossSection: 40,
    },
  },
  {
    name: 'cross-section pinched (900)',
    category: 'cross-section',
    fixture: 'guide',
    expectation: {
      path: [
        [0, 0, 5],
        [0, 0, 40],
      ],
      material: ['guide'],
      resolution: 1,
      minCrossSection: 900,
    },
  },
  {
    name: 'combined pass (conn+iso+xsec 100)',
    category: 'cross-section',
    fixture: 'housing',
    expectation: {
      path: [
        [0, 0, 10],
        [0, 0, 55],
      ],
      material: ['housing'],
      resolution: 2,
      isolatedFrom: [[0, 0, -3]],
      minCrossSection: 100,
      bounds: housingBlockBounds,
    },
  },
  {
    name: 'section finer than grid (2 @ res 1)',
    category: 'cross-section-quantized',
    fixture: 'guide',
    expectation: {
      path: [
        [0, 0, 5],
        [0, 0, 40],
      ],
      material: ['guide'],
      resolution: 1,
      minCrossSection: 2,
    },
  },
  {
    name: 'band swamps section (40 @ res 2)',
    category: 'cross-section-quantized',
    fixture: 'guide',
    expectation: {
      path: [
        [0, 0, 5],
        [0, 0, 40],
      ],
      material: ['guide'],
      resolution: 2,
      minCrossSection: 40,
    },
  },
];

describe('void differential corpus — voxel vs forced topological', () => {
  let guide: GeometrySubject;
  let housing: GeometrySubject;
  let guideContext: RelationshipProofContext;
  let housingContext: RelationshipProofContext;

  beforeAll(async () => {
    guide = await loadStep({ source: guidePath, name: 'guide' });
    housing = await loadStep({ source: housingPath, name: 'housing' });
    const builtGuide = getSubjectProofContext(guide);
    const builtHousing = getSubjectProofContext(housing);
    if (!builtGuide || !builtHousing) {
      throw new Error('void differential fixtures must carry STEP-XDE + native BRep.');
    }
    guideContext = builtGuide;
    housingContext = builtHousing;
  }, 120_000);

  afterAll(() => {
    guide.nativeXde?.delete?.();
    housing.nativeXde?.delete?.();
  });

  it('should run the whole corpus through both engines and reconcile every verdict', () => {
    const rows = claims.map((claim) => {
      const context = claim.fixture === 'guide' ? guideContext : housingContext;
      const voxel = verdict(withEngine(undefined, () => proveVoidContinuity(claim.expectation, context)));
      const topological = verdict(withEngine('topological', () => proveVoidContinuity(claim.expectation, context)));
      return { ...claim, voxel, topological, agree: voxel === topological };
    });

    // eslint-disable-next-line no-console -- the differential corpus table is the sign-off deliverable
    console.log('\ncategory\tvoxel\ttopo\tagree\tclaim');
    for (const row of rows) {
      // eslint-disable-next-line no-console -- the differential corpus table is the sign-off deliverable
      console.log(`${row.category}\t${row.voxel}\t${row.topological}\t${row.agree ? 'Y' : 'N'}\t${row.name}`);
    }

    // Sound core: connectivity, isolation, and setup verdicts must AGREE exactly.
    for (const row of rows) {
      if (row.category === 'connectivity' || row.category === 'isolation' || row.category === 'setup') {
        expect({ claim: row.name, verdict: row.topological }).toEqual({ claim: row.name, verdict: row.voxel });
      }
    }

    // Clear cross-section verdicts (section well inside/outside the grid) agree.
    for (const row of rows) {
      if (row.category === 'cross-section') {
        expect({ claim: row.name, verdict: row.topological }).toEqual({ claim: row.name, verdict: row.voxel });
      }
    }

    // Verdict-model migration: where the voxel engine REFUSES a cross-section its
    // quantization cannot bound (Nyquist guard / band swamp), the continuous mesh
    // section decides it. Assert that expected direction — voxel unsupported,
    // topological a definite verdict — so the divergence is documented, not a
    // silent regression.
    for (const row of rows) {
      if (row.category === 'cross-section-quantized') {
        expect(row.voxel).toBe('unsupported');
        expect(topologicalDecides(row.topological)).toBe(true);
      }
    }
  }, 60_000);
});

const topologicalDecides = (v: Verdict): boolean => v === 'pass' || v === 'fail';
