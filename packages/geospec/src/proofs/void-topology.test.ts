import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Manifold as ManifoldSolid } from 'manifold-3d';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import { ensureManifoldModule } from '#mesh/manifold-module.js';
import type { GeometryDiagnostic, GeometrySubject, Vec3 } from '#mesh/types.js';
import { setForensicEnabled } from '#runner/forensic.js';
import type { GeoSpecVoidContinuityExpectation } from '#runner/types.js';
import { loadStep } from '#step/index.js';
import { getSubjectProofContext } from '#proofs/index.js';
import type { RelationshipProofContext } from '#proofs/index.js';
import { proveVoidContinuity } from '#proofs/void-continuity.js';
import { lumenBottleneck, materialsPairwiseAabbDisjoint, materialsStrictlyInterior } from '#proofs/void-topology.js';
import { generalizedWindingNumber } from '#proofs/winding-number.js';

const fixture = (relative: string): string => join(import.meta.dirname, '../../fixtures', relative);

// Same native fixtures as the voxel engine's suite: valve-stem-guide (a 20x20x45
// box with a single r4.03 +Z through-bore, exact lumen ~51 mm2) and
// filter-inside-housing (a cup with a blind r27 cavity over a 3 mm floor).
const guidePath = fixture('containment/valve-stem-guide-positive/model.step');
const housingPath = fixture('containment/filter-inside-housing-positive/model.step');
const housingBlockBounds = { min: [-15, -15, -6] as const, max: [15, 15, 62] as const };

/** Run `run` with GEOSPEC_VOID_ENGINE pinned, restoring the prior value. */
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

type Verdict = { outcome: 'pass' | 'fail' | 'unsupported'; code?: string };

/** Collapse a diagnostic list to its parity-relevant verdict (outcome + code). */
const summarize = (diagnostics: GeometryDiagnostic[]): Verdict => {
  const first = diagnostics[0];
  if (!first) {
    return { outcome: 'pass' };
  }
  return {
    outcome: first.code === 'GEOSPEC_VOID_CONTINUITY_MISMATCH' ? 'fail' : 'unsupported',
    code: first.code,
  };
};

describe('void-topology engine (spike, GEOSPEC_VOID_ENGINE=topological)', () => {
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
      throw new Error('void-topology fixtures must carry STEP-XDE and native BRep evidence.');
    }
    guideContext = guideBuilt;
    housingContext = housingBuilt;
  }, 120_000);

  afterAll(() => {
    guide.nativeXde?.delete?.();
    housing.nativeXde?.delete?.();
  });

  /**
   * The differential gate: the topological verdict must match the voxel verdict
   * (outcome + code) on the identical claim. Returns both diagnostic lists for
   * finer assertions.
   */
  const expectParity = (
    expectation: GeoSpecVoidContinuityExpectation,
    context: RelationshipProofContext,
  ): { voxel: GeometryDiagnostic[]; topological: GeometryDiagnostic[] } => {
    const voxel = withEngine(undefined, () => proveVoidContinuity(expectation, context));
    const topological = withEngine('topological', () => proveVoidContinuity(expectation, context));
    expect(summarize(topological)).toEqual(summarize(voxel));
    return { voxel, topological };
  };

  it('should agree with the voxel engine on a connected through-void (pass)', () => {
    const { topological } = expectParity(
      {
        path: [
          [0, 0, 3],
          [0, 0, 42],
        ],
        material: ['guide'],
        resolution: 1,
      },
      guideContext,
    );
    expect(topological).toEqual([]);
  }, 30_000);

  it('should agree on a broken path across the sealing floor (fail), via mesh Decompose', () => {
    const { topological } = expectParity(
      {
        path: [
          [0, 0, 30],
          [0, 0, -3],
        ],
        material: ['housing'],
        resolution: 2,
        bounds: housingBlockBounds,
      },
      housingContext,
    );
    // The topological engine actually ran (not a silent voxel fallback) and
    // decided connectivity from the decomposed component identity.
    expect(topological[0]?.code).toBe('GEOSPEC_VOID_CONTINUITY_MISMATCH');
    expect(topological[0]?.message).toContain('path is broken');
    expect((topological[0]?.details as { engine?: string } | undefined)?.engine).toBe('topological');
    expect(topological[0]?.spatial?.center).toBeDefined();
  }, 30_000);

  it('should agree on a waypoint buried in the floor material (fail)', () => {
    const { topological } = expectParity(
      {
        path: [
          [0, 0, 30],
          [0, 0, 1.5],
        ],
        material: ['housing'],
        resolution: 2,
        bounds: housingBlockBounds,
      },
      housingContext,
    );
    expect(topological[0]?.message).toContain('inside material');
    expect((topological[0]?.details as { engine?: string } | undefined)?.engine).toBe('topological');
  }, 30_000);

  it('should agree on isolation holding across the floor (pass)', () => {
    const { topological } = expectParity(
      {
        path: [
          [0, 0, 10],
          [0, 0, 55],
        ],
        material: ['housing'],
        resolution: 2,
        isolatedFrom: [[0, 0, -3]],
        bounds: housingBlockBounds,
      },
      housingContext,
    );
    expect(topological).toEqual([]);
  }, 30_000);

  it('should agree on isolation breached within one cavity component (fail)', () => {
    const { topological } = expectParity(
      {
        path: [
          [0, 0, 10],
          [0, 0, 55],
        ],
        material: ['housing'],
        resolution: 2,
        isolatedFrom: [[0, 0, 35]],
        bounds: housingBlockBounds,
      },
      housingContext,
    );
    expect(topological[0]?.message).toContain('isolation breached');
    expect(topological[0]?.spatial?.center).toEqual([0, 0, 35]);
  }, 30_000);

  it('should narrow the cross-section to the bore lumen, not the whole component', () => {
    // Verdict parity on a pinched threshold, AND the measured throat must be the
    // r4.03 bore (~51 mm2) — proving CrossSection.decompose() + point-in-polygon
    // isolates the lumen piece from the surrounding shell void (which would
    // otherwise over-report the throat and flip the verdict).
    const { topological } = expectParity(
      {
        path: [
          [0, 0, 5],
          [0, 0, 40],
        ],
        material: ['guide'],
        resolution: 1,
        minCrossSection: 900,
      },
      guideContext,
    );
    expect(topological[0]?.code).toBe('GEOSPEC_VOID_CONTINUITY_MISMATCH');
    const measured =
      (topological[0]?.details as { measuredCrossSection?: number } | undefined)?.measuredCrossSection ?? 0;
    expect(measured).toBeGreaterThan(40);
    expect(measured).toBeLessThan(70);
  }, 30_000);

  it('should agree on a wide-enough lumen clearing its minimum cross-section (pass)', () => {
    const { topological } = expectParity(
      {
        path: [
          [0, 0, 5],
          [0, 0, 40],
        ],
        material: ['guide'],
        resolution: 1,
        minCrossSection: 40,
      },
      guideContext,
    );
    expect(topological).toEqual([]);
  }, 30_000);

  it('should measure the bore throat within 1% of analytic, conservatively and deterministically (§16)', () => {
    // The r4.03 through-bore has a true section of π·4.03² ≈ 51.02 mm². The
    // topological slice is of the INSCRIBED tessellation of the concave bore
    // wall, so it under-reports — a min-cross-section check can never falsely
    // PASS (the voxel engine's "never manufacture a pass" principle, §16).
    const analytic = Math.PI * 4.03 * 4.03;
    const claim: GeoSpecVoidContinuityExpectation = {
      path: [
        [0, 0, 5],
        [0, 0, 40],
      ],
      material: ['guide'],
      resolution: 1,
      minCrossSection: 900, // Far above the bore → fails, exposing the measurement.
    };
    const readMeasured = (diagnostics: GeometryDiagnostic[]): number =>
      (diagnostics[0]?.details as { measuredCrossSection?: number } | undefined)?.measuredCrossSection ?? 0;
    const first = readMeasured(withEngine('topological', () => proveVoidContinuity(claim, guideContext)));
    const second = readMeasured(withEngine('topological', () => proveVoidContinuity(claim, guideContext)));
    // Determinism: identical across runs (a pure function of the tessellation).
    expect(second).toBe(first);
    // Conservative: measured ≤ analytic.
    expect(first).toBeLessThanOrEqual(analytic);
    // Accurate: within 1% of analytic at the engine's deflection.
    expect(first).toBeGreaterThan(analytic * 0.99);
  }, 30_000);

  it('should emit the CR1 constructibility census under forensic timing', () => {
    const lines: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((
      chunk: string | Uint8Array<ArrayBuffer>,
    ): boolean => {
      lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stderr.write);
    setForensicEnabled(true);
    try {
      const connectivity = withEngine('topological', () =>
        proveVoidContinuity(
          {
            path: [
              [0, 0, 3],
              [0, 0, 42],
            ],
            material: ['guide'],
            resolution: 1,
          },
          guideContext,
        ),
      );
      expect(connectivity).toEqual([]);
      const throat = withEngine('topological', () =>
        proveVoidContinuity(
          {
            path: [
              [0, 0, 5],
              [0, 0, 40],
            ],
            material: ['guide'],
            resolution: 1,
            minCrossSection: 40,
          },
          guideContext,
        ),
      );
      expect(throat).toEqual([]);
    } finally {
      setForensicEnabled(false);
      spy.mockRestore();
    }

    const census = lines.filter((line) => line.includes('void.census.'));
    const read = (label: string): number[] =>
      census
        .filter((line) => line.includes(`void.census.${label}\t`))
        .map((line) => Number(line.trim().split('\t')[1]));
    // Two builds (no evidence store is installed in this suite): the plain
    // connectivity claim, then the cross-section claim that needs the solid.
    expect(read('build')).toEqual([1, 1]);
    expect(read('materials')).toEqual([1, 1]);
    expect(read('needsSolid')).toEqual([0, 1]);
    // The default region is the material's inflated bounds, so the single
    // material sits strictly interior and is vacuously pairwise-separated.
    expect(read('interior')).toEqual([1, 1]);
    expect(read('aabbDisjoint')).toEqual([1, 1]);
  }, 60_000);

  it('should share claim resolution with the voxel engine (identical rejection)', () => {
    // Both engines route through resolveVoidClaim, so a claim with neither
    // material nor bounds is rejected identically — the parity signal measures
    // the engine, never a setup divergence.
    const expectation: GeoSpecVoidContinuityExpectation = {
      path: [
        [0, 0, 10],
        [0, 0, 55],
      ],
    };
    const voxel = withEngine(undefined, () => proveVoidContinuity(expectation, housingContext));
    const topological = withEngine('topological', () => proveVoidContinuity(expectation, housingContext));
    expect(topological).toEqual(voxel);
    expect(topological[0]?.message).toContain('material set or explicit bounds');
  });
});

describe('winding-number membership (V3) — the fix for two sealed interior voids', () => {
  // The parity corpus can't exercise the V2 collapse: it needs two DISCONNECTED
  // fully-interior voids, which no fixture has. Build it synthetically via
  // Manifold — a region cube minus a hollow block (walls [±2..±5] enclosing an
  // empty cavity [−2,2]³, all inside the region [−10,10]³). The void is then the
  // margin shell (outside the block) plus the sealed inner cavity: two
  // disconnected bodies separated by the block walls (material).
  it('should give distinct bodies where the probe-argmax collapsed them', async () => {
    const wasm = await ensureManifoldModule();
    const region = wasm.Manifold.cube([20, 20, 20], true);
    const block = wasm.Manifold.cube([10, 10, 10], true);
    const cavity = wasm.Manifold.cube([4, 4, 4], true);
    const material = block.subtract(cavity);
    const voidSolid = region.subtract(material);
    const shells = voidSolid.decompose();
    const shellMeshes = shells.map((shell) => {
      const mesh = shell.getMesh();
      return {
        vertProperties: new Float64Array(mesh.vertProperties),
        triVerts: new Uint32Array(mesh.triVerts),
        stride: mesh.numProp,
        volume: shell.volume(),
      };
    });

    const classify = (point: Vec3): { open: boolean; signature: string; perShell: number[] } => {
      let sum = 0;
      const perShell: number[] = [];
      for (const mesh of shellMeshes) {
        const winding = generalizedWindingNumber(point, mesh);
        sum += winding;
        perShell.push(Math.round(winding));
      }
      return { open: Math.round(sum) >= 1, signature: perShell.join(','), perShell };
    };

    const margin = classify([7, 0, 0]); // Outside the block → margin void.
    const inner = classify([0, 0, 0]); // Sealed cavity void.
    const wall = classify([3.5, 0, 0]); // Inside the block wall → material.

    for (const shell of shells) {
      shell.delete();
    }
    voidSolid.delete();
    material.delete();
    cavity.delete();
    block.delete();
    region.delete();

    // Openness is robust (signed sum over shells): both voids are open, the wall
    // is material.
    expect(margin.open).toBe(true);
    expect(inner.open).toBe(true);
    expect(wall.open).toBe(false);

    // The fix: the two sealed voids are DIFFERENT bodies (distinct sign vectors).
    expect(margin.signature).not.toBe(inner.signature);

    // What V2 got wrong: the maximal-volume shell (the region envelope) encloses
    // BOTH points identically, so membership by that dominant shell alone — the
    // probe-argmax winner — reads them as one body. Only the full per-shell
    // vector, via the cavity shell, separates them.
    let dominantIndex = 0;
    for (let index = 1; index < shellMeshes.length; index += 1) {
      if (shellMeshes[index]!.volume > shellMeshes[dominantIndex]!.volume) {
        dominantIndex = index;
      }
    }
    expect(margin.perShell[dominantIndex]).toBe(inner.perShell[dominantIndex]);
    expect(Math.abs(margin.perShell[dominantIndex]!)).toBe(1);
  }, 30_000);
});

describe('V4 arbitrary-axis cross-section', () => {
  it('should measure the true perpendicular throat of an oblique bore', async () => {
    // A radius-3 cylinder tilted 45° about X (axis → (0, −1, 1)/√2). The true
    // perpendicular section is π·3² ≈ 28.3 mm²; a naive Z-slice would cut an
    // ellipse ~√2× larger (~40 mm²). V4 rotates each segment to +Z, so it must
    // recover the circular throat.
    const wasm = await ensureManifoldModule();
    const radius = 3;
    const length = 40;
    const upright = wasm.Manifold.cylinder(length, radius, radius, 128, true);
    const oblique = upright.rotate([45, 0, 0]);
    upright.delete();

    const axis: Vec3 = [0, -Math.SQRT1_2, Math.SQRT1_2];
    const half = length / 2 - 4; // Stay clear of the end caps.
    const from: Vec3 = [axis[0] * -half, axis[1] * -half, axis[2] * -half];
    const to: Vec3 = [axis[0] * half, axis[1] * half, axis[2] * half];

    const result = lumenBottleneck({ solid: oblique, waypoints: [from, to], resolution: 1 });
    oblique.delete();

    expect(result).toBeDefined();
    // True circle, not the √2-inflated diagonal ellipse (~40).
    expect(result!.area).toBeCloseTo(Math.PI * radius * radius, 0);
    expect(result!.area).toBeLessThan(34);
  }, 30_000);
});

describe('§16 cross-section determinism and tessellation bias', () => {
  it('should under-report the true section (conservative), converge with tessellation, deterministically', async () => {
    // A radius-5 cylinder: analytic section π·5² ≈ 78.54 mm². The topological
    // slice is the inscribed n-gon of the tessellated wall, so it is ≤ analytic
    // at every tessellation and converges up as the mesh refines — a bounded,
    // deterministic, fail-safe bias (§16 accuracy/determinism).
    const wasm = await ensureManifoldModule();
    const radius = 5;
    const analytic = Math.PI * radius * radius;
    const measure = (segments: number): number => {
      const cylinder = wasm.Manifold.cylinder(40, radius, radius, segments, true);
      const from: Vec3 = [0, 0, -15];
      const to: Vec3 = [0, 0, 15];
      const first = lumenBottleneck({ solid: cylinder, waypoints: [from, to], resolution: 1 });
      const second = lumenBottleneck({ solid: cylinder, waypoints: [from, to], resolution: 1 });
      cylinder.delete();
      // Determinism: repeated measurement of the same solid is identical.
      expect(second!.area).toBe(first!.area);
      return first!.area;
    };
    const coarse = measure(16);
    const fine = measure(128);
    // Conservative at every tessellation (inscribed polygon ≤ true circle).
    expect(coarse).toBeLessThanOrEqual(analytic);
    expect(fine).toBeLessThanOrEqual(analytic);
    // Converges: finer tessellation is closer to analytic, and within 0.1% by 128.
    expect(fine).toBeGreaterThan(coarse);
    expect(fine).toBeGreaterThan(analytic * 0.999);
  }, 30_000);
});

describe('CR1 constructibility census helpers', () => {
  const region = { min: [-10, -10, -10] as Vec3, max: [10, 10, 10] as Vec3 };

  const withCubes = async (bounds: Array<[Vec3, Vec3]>, run: (materials: ManifoldSolid[]) => void): Promise<void> => {
    const wasm = await ensureManifoldModule();
    const materials = bounds.map(([min, max]) =>
      wasm.Manifold.cube([max[0] - min[0], max[1] - min[1], max[2] - min[2]], false).translate(min),
    );
    try {
      run(materials);
    } finally {
      for (const material of materials) {
        material.delete();
      }
    }
  };

  it('should accept only materials strictly inside the region on every axis', async () => {
    // Strictly interior.
    await withCubes(
      [
        [
          [-5, -5, -5],
          [5, 5, 5],
        ],
      ],
      (materials) => {
        expect(materialsStrictlyInterior(materials, region)).toBe(true);
      },
    );
    // Crossing the region minimum wall (x).
    await withCubes(
      [
        [
          [-12, -5, -5],
          [0, 5, 5],
        ],
      ],
      (materials) => {
        expect(materialsStrictlyInterior(materials, region)).toBe(false);
      },
    );
    // Crossing the region maximum wall (z) with all minima interior.
    await withCubes(
      [
        [
          [-5, -5, -5],
          [5, 5, 12],
        ],
      ],
      (materials) => {
        expect(materialsStrictlyInterior(materials, region)).toBe(false);
      },
    );
    // One interior material plus one violator: the set is not constructible.
    await withCubes(
      [
        [
          [-5, -5, -5],
          [0, 0, 0],
        ],
        [
          [0, 0, 0],
          [5, 5, 12],
        ],
      ],
      (materials) => {
        expect(materialsStrictlyInterior(materials, region)).toBe(false);
      },
    );
  });

  it('should accept only pairwise AABB-separated material sets', async () => {
    // Single material: vacuously separated.
    await withCubes(
      [
        [
          [-5, -5, -5],
          [5, 5, 5],
        ],
      ],
      (materials) => {
        expect(materialsPairwiseAabbDisjoint(materials)).toBe(true);
      },
    );
    // Separated along x, both argument orders.
    await withCubes(
      [
        [
          [-8, -2, -2],
          [-4, 2, 2],
        ],
        [
          [4, -2, -2],
          [8, 2, 2],
        ],
      ],
      (materials) => {
        expect(materialsPairwiseAabbDisjoint(materials)).toBe(true);
        expect(materialsPairwiseAabbDisjoint([...materials].reverse())).toBe(true);
      },
    );
    // Separated only along y: the axis scan must advance past x.
    await withCubes(
      [
        [
          [-2, -8, -2],
          [2, -4, 2],
        ],
        [
          [-2, 4, -2],
          [2, 8, 2],
        ],
      ],
      (materials) => {
        expect(materialsPairwiseAabbDisjoint(materials)).toBe(true);
      },
    );
    // Overlapping boxes: no separating axis.
    await withCubes(
      [
        [
          [-2, -2, -2],
          [2, 2, 2],
        ],
        [
          [0, 0, 0],
          [4, 4, 4],
        ],
      ],
      (materials) => {
        expect(materialsPairwiseAabbDisjoint(materials)).toBe(false);
      },
    );
    // Three mutually separated materials: every pair is screened.
    await withCubes(
      [
        [
          [-8, -2, -2],
          [-4, 2, 2],
        ],
        [
          [4, -2, -2],
          [8, 2, 2],
        ],
        [
          [-2, 4, -2],
          [2, 8, 2],
        ],
      ],
      (materials) => {
        expect(materialsPairwiseAabbDisjoint(materials)).toBe(true);
      },
    );
  });
});

describe('void-topology shell persistence (R5)', () => {
  let guide: GeometrySubject;
  let guideContext: RelationshipProofContext;

  beforeAll(async () => {
    guide = await loadStep({ source: guidePath, name: 'valve-stem-guide-r5' });
    const built = getSubjectProofContext(guide);
    if (!built) {
      throw new Error('void-topology R5 fixture must carry STEP-XDE and native BRep evidence.');
    }
    guideContext = built;
  }, 120_000);

  afterEach(() => {
    setGeoSpecEvidenceStore(undefined);
  });

  afterAll(() => {
    guide.nativeXde?.delete?.();
  });

  it('should replay decomposed shells with zero tessellation fetches on the warm run', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    let fetches = 0;
    const counting: RelationshipProofContext = {
      ...guideContext,
      occurrenceMesh: (occurrence, options) => {
        fetches += 1;
        return guideContext.occurrenceMesh!(occurrence, options);
      },
    };
    const claim: GeoSpecVoidContinuityExpectation = {
      path: [
        [0, 0, 3],
        [0, 0, 42],
      ],
      material: ['guide'],
      resolution: 1,
    };

    const cold = withEngine('topological', () => proveVoidContinuity(claim, counting));
    // The cold run must actually build (fetch tessellations) — otherwise the
    // warm assertion below would be vacuous.
    expect(fetches).toBeGreaterThan(0);
    const coldFetches = fetches;

    const warm = withEngine('topological', () => proveVoidContinuity(claim, counting));

    // Warm: shells replay from the persisted family; the Manifold build (and
    // therefore every tessellation fetch) is skipped entirely.
    expect(fetches).toBe(coldFetches);
    expect(warm).toEqual(cold);
    expect(cold).toEqual([]);
  }, 60_000);

  it('should keep building the live solid for cross-section claims', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    let fetches = 0;
    const counting: RelationshipProofContext = {
      ...guideContext,
      occurrenceMesh: (occurrence, options) => {
        fetches += 1;
        return guideContext.occurrenceMesh!(occurrence, options);
      },
    };
    const claim: GeoSpecVoidContinuityExpectation = {
      path: [
        [0, 0, 3],
        [0, 0, 42],
      ],
      material: ['guide'],
      resolution: 1,
      minCrossSection: 40,
    };

    const cold = withEngine('topological', () => proveVoidContinuity(claim, counting));
    const coldFetches = fetches;
    const warm = withEngine('topological', () => proveVoidContinuity(claim, counting));

    // Cross-section claims need the live void solid: both runs build (the
    // fetcher memo absorbs the native cost, but the build path itself runs).
    expect(fetches).toBe(coldFetches * 2);
    expect(warm).toEqual(cold);
    expect(cold).toEqual([]);
  }, 60_000);
});
