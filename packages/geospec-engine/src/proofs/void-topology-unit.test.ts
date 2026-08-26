import { afterEach, describe, expect, it } from 'vitest';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import { ensureManifoldModule } from '#mesh/manifold-module.js';
import type { GeometryDiagnostic, Vec3 } from '#mesh/types.js';
import { boxSoup } from '#mesh/testing/overlap-subjects.js';
import type { RelationshipProofContext } from '#proofs/context.js';
import { boxContext } from '#proofs/testing/box-world.js';
import { proveVoidContinuity } from '#proofs/void-continuity.js';
import type { Box } from '#proofs/testing/box-world.js';
import {
  applyMatrix,
  lumenBottleneck,
  pointInPolygons,
  rotationToZ,
  voidSectionSpacingMm,
  voidTessellationDeflectionMm,
} from '#proofs/void-topology.js';
import type { GeoSpecVoidContinuityExpectation } from '#runner/types.js';

const material: Box = { min: [-5, -5, -5], max: [5, 5, 5] };
const region = { min: [-10, -10, -10] as Vec3, max: [10, 10, 10] as Vec3 };

const topologicalContext = (options?: {
  box?: Box;
  mesh?: 'none' | 'empty' | 'open';
  contentHash?: string;
}): RelationshipProofContext => {
  const solid = options?.box ?? material;
  const base = boxContext([solid]);
  const soup =
    options?.mesh === 'open'
      ? // Half a box: an open surface Manifold must reject.
        boxSoup(solid.min, solid.max).slice(0, 27)
      : boxSoup(solid.min, solid.max);
  return {
    ...base,
    occurrenceIndexByPath: new Map([['block', 0]]),
    index: {
      ...base.index,
      occurrences: [
        { path: 'block', productName: 'block', transform: [], shapeIndex: 0, ordinalPath: [1], bounds: solid },
      ],
    },
    ...(options?.contentHash === undefined ? {} : { subjectContentHash: options.contentHash }),
    ...(options?.mesh === 'none'
      ? {}
      : {
          occurrenceMesh: () =>
            options?.mesh === 'empty'
              ? undefined
              : { positions: Float32Array.from(soup), triangleCount: soup.length / 9 },
        }),
  };
};

const prove = (expectation: GeoSpecVoidContinuityExpectation, context = topologicalContext()): GeometryDiagnostic[] =>
  proveVoidContinuity(expectation, context);

const shellPath: GeoSpecVoidContinuityExpectation = {
  path: [
    [0, 0, -8],
    [0, 0, -7],
  ],
  material: ['block'],
  bounds: region,
};

afterEach(() => {
  setGeoSpecEvidenceStore(undefined);
});

describe('versioned void proof constants', () => {
  it('should retain the ratified tessellation and station spacing', () => {
    expect(voidTessellationDeflectionMm).toBe(0.02);
    expect(voidSectionSpacingMm).toBe(2);
  });

  it('should request occurrence tessellation at the fixed deflection', () => {
    const context = topologicalContext();
    const deflections: number[] = [];
    const occurrenceMesh = context.occurrenceMesh!;
    expect(
      prove(shellPath, {
        ...context,
        occurrenceMesh: (occurrence, options) => {
          if (options?.deflection === undefined) {
            throw new Error('canonical void proof must declare its tessellation deflection');
          }
          deflections.push(options.deflection);
          return occurrenceMesh(occurrence, options);
        },
      }),
    ).toEqual([]);
    expect(deflections).toEqual([voidTessellationDeflectionMm]);
  });
});

describe('rotationToZ (Rodrigues, with the antipodal degenerate case)', () => {
  const sendsToZ = (direction: Vec3): Vec3 => applyMatrix(rotationToZ(direction), direction);

  it('should send a general direction onto +Z', () => {
    const rotated = sendsToZ([0, -Math.SQRT1_2, Math.SQRT1_2]);
    expect(rotated[0]).toBeCloseTo(0, 12);
    expect(rotated[1]).toBeCloseTo(0, 12);
    expect(rotated[2]).toBeCloseTo(1, 12);
  });

  it('should send -Z onto +Z with the canonical 180° X-flip', () => {
    expect(rotationToZ([0, 0, -1])).toEqual([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]);
    const rotated = sendsToZ([0, 0, -1]);
    expect(rotated[2]).toBe(1);
  });

  it('should treat a degenerate direction as +Z, which is already the identity', () => {
    expect(applyMatrix(rotationToZ([0, 0, 0]), [1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe('pointInPolygons', () => {
  const square: Array<Array<[number, number]>> = [
    [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ],
  ];
  const withHole = [
    ...square,
    [
      [1, 1],
      [3, 1],
      [3, 3],
      [1, 3],
    ] as Array<[number, number]>,
  ];

  it('should read a simple contour', () => {
    expect(pointInPolygons([2, 2], square)).toBe(true);
    expect(pointInPolygons([5, 2], square)).toBe(false);
    expect(pointInPolygons([2, 5], square)).toBe(false);
  });

  it('should exclude a hole by crossing parity', () => {
    expect(pointInPolygons([2, 2], withHole)).toBe(false);
    expect(pointInPolygons([0.5, 2], withHole)).toBe(true);
  });
});

describe('lumenBottleneck', () => {
  it('should skip a zero-length segment', async () => {
    const wasm = await ensureManifoldModule();
    const cube = wasm.Manifold.cube([10, 10, 10], true);
    expect(
      lumenBottleneck({
        solid: cube,
        waypoints: [
          [0, 0, 0],
          [0, 0, 0],
        ],
      }),
    ).toBeUndefined();
    cube.delete();
  });
});

describe('the topological engine refuses rather than downgrading', () => {
  it('should refuse a subject with no tessellation fetcher', () => {
    const diagnostics = prove(shellPath, topologicalContext({ mesh: 'none' }));
    expect(diagnostics[0]?.code).toBe('GEOSPEC_VOID_CONTINUITY_UNSUPPORTED');
    expect(diagnostics[0]?.message).toContain('needs per-occurrence tessellation');
  });

  it('should refuse an occurrence with no tessellation', () => {
    expect(prove(shellPath, topologicalContext({ mesh: 'empty' }))[0]?.message).toContain(
      "closed solid for material occurrence 'block'",
    );
  });

  it('should refuse a soup Manifold rejects', () => {
    expect(prove(shellPath, topologicalContext({ mesh: 'open' }))[0]?.message).toContain(
      "closed solid for material occurrence 'block'",
    );
  });

  it('should refuse a region the material fills completely', () => {
    const diagnostics = prove({
      path: [[0, 0, 0]],
      material: ['block'],
      bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
    });
    expect(diagnostics[0]?.message).toContain('no void at all');
  });

  it('should refuse a waypoint balanced on a void boundary', () => {
    const diagnostics = prove({ ...shellPath, path: [[5, 0, 0]] });
    expect(diagnostics[0]?.message).toContain('sits on a void boundary');
  });

  it('should refuse an isolation probe that is not itself in the void', () => {
    const diagnostics = prove({ ...shellPath, isolatedFrom: [[0, 0, 0]] });
    expect(diagnostics[0]?.message).toContain('is not in the void');
  });

  it('should refuse a cross-section claim with no segment to walk', () => {
    const diagnostics = prove({ ...shellPath, path: [[0, 0, -8]], minCrossSection: 100 });
    expect(diagnostics[0]?.message).toContain('could not section the lumen');
  });
});

describe('multi-material topology', () => {
  it('should union overlapping material solids and report the non-disjoint census', () => {
    const left = material;
    const right: Box = { min: [0, -5, -5], max: [10, 5, 5] };
    const base = boxContext([left, right]);
    const meshes = [boxSoup(left.min, left.max), boxSoup(right.min, right.max)];
    const measurements: Array<{ name: string; value: number }> = [];
    const context: RelationshipProofContext = {
      ...base,
      index: {
        ...base.index,
        occurrences: [left, right].map((bounds, index) => ({
          path: `box${index}`,
          productName: `box${index}`,
          transform: [],
          shapeIndex: index,
          ordinalPath: [index + 1],
          bounds,
        })),
      },
      occurrenceMesh: (occurrence) => ({
        positions: Float32Array.from(meshes[occurrence]!),
        triangleCount: meshes[occurrence]!.length / 9,
      }),
      forensic: (measurement) => measurements.push(measurement),
    };

    expect(
      prove(
        {
          path: [[-10, 0, 0]],
          material: ['box0', 'box1'],
          bounds: { min: [-15, -15, -15], max: [15, 15, 15] },
        },
        context,
      ),
    ).toEqual([]);
    expect(measurements).toContainEqual({ name: 'void.census.aabbDisjoint', value: 0, unit: 'count' });
  });
});

describe('a material set where only one occurrence fails', () => {
  it('should release the solids it already built and name the one that failed', () => {
    const base = topologicalContext();
    const soup = boxSoup(material.min, material.max);
    const pair: RelationshipProofContext = {
      ...base,
      occurrenceIndexByPath: new Map([
        ['block', 0],
        ['ghost', 1],
      ]),
      index: {
        ...base.index,
        occurrences: [
          { path: 'block', productName: 'block', transform: [], shapeIndex: 0, ordinalPath: [1], bounds: material },
          {
            path: 'ghost',
            productName: 'ghost',
            transform: [],
            shapeIndex: 1,
            ordinalPath: [2],
            bounds: { min: [6, 6, 6], max: [7, 7, 7] },
          },
        ],
      },
      occurrenceMesh: (occurrence) =>
        occurrence === 0 ? { positions: Float32Array.from(soup), triangleCount: soup.length / 9 } : undefined,
    };
    expect(prove({ ...shellPath, material: ['block', 'ghost'] }, pair)[0]?.message).toContain(
      "closed solid for material occurrence 'ghost'",
    );
  });
});

describe('void-topology-shells persistence', () => {
  it('should treat an unreadable stored shell payload as a miss', () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    const context = topologicalContext({ contentHash: 'block-subject' });
    expect(prove(shellPath, context)).toEqual([]);
    expect(store.families()).toEqual(['void-topology-shells']);
    for (const key of store.entries.keys()) {
      store.entries.set(key, Uint8Array.from([9, 9, 9]));
    }
    expect(prove(shellPath, context)).toEqual([]);
  });
});
