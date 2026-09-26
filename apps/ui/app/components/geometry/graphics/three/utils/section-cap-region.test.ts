// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSeededRandom } from '#components/geometry/loader/metal-morph-sequence.js';
import {
  buildSectionCapPolygon,
  createSectionCutPlaneBasis,
  sanitizeCapRing,
} from '#components/geometry/graphics/three/utils/section-cap-region.js';
import type { CapPoint2 } from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

// ── The sanitizer before its collinear pass became single-pass, kept to prove the output is unchanged ──
const referenceRingEpsilon = 1e-8;
const referenceAreaEpsilon = 1e-10;

const referenceDistanceSquared = (a: CapPoint2, b: CapPoint2): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

const referenceIsCollinear = (a: CapPoint2, b: CapPoint2, c: CapPoint2): boolean =>
  Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) <= referenceRingEpsilon;

const referenceSignedArea = (ring: readonly CapPoint2[]): number => {
  let twiceArea = 0;
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index]!;
    const next = ring[(index + 1) % ring.length]!;
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return twiceArea / 2;
};

/** The finite, deduplicated ring the collinear pass starts from. */
const prepareRingByReference = (ring: readonly CapPoint2[]): CapPoint2[] => {
  const finite: CapPoint2[] = [];
  const epsilonSquared = referenceRingEpsilon * referenceRingEpsilon;
  for (const point of ring) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      continue;
    }
    const next: CapPoint2 = [point[0], point[1]];
    const previous = finite.at(-1);
    if (!previous || referenceDistanceSquared(previous, next) > epsilonSquared) {
      finite.push(next);
    }
  }
  while (finite.length > 1 && referenceDistanceSquared(finite[0]!, finite.at(-1)!) <= epsilonSquared) {
    finite.pop();
  }
  return finite;
};

const sanitizeCapRingByRestartingScan = (ring: readonly CapPoint2[]): CapPoint2[] => {
  const finite = prepareRingByReference(ring);
  let changed = true;
  while (changed && finite.length >= 3) {
    changed = false;
    for (let index = 0; index < finite.length; index++) {
      const previous = finite[(index + finite.length - 1) % finite.length]!;
      const next = finite[(index + 1) % finite.length]!;
      if (referenceIsCollinear(previous, finite[index]!, next)) {
        finite.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  return finite.length < 3 || Math.abs(referenceSignedArea(finite)) <= referenceAreaEpsilon ? [] : finite;
};

// ── Ring generators: seeded, and biased towards the collinear runs and near-threshold turns that make the
// order of removals matter ──
type RingGenerator = (random: () => number) => CapPoint2[];

const pointBetween = ([from, to]: readonly [CapPoint2, CapPoint2], t: number, offset: number): CapPoint2 => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy) || 1;
  return [from[0] + dx * t - (dy / length) * offset, from[1] + dy * t + (dx / length) * offset];
};

/** A convex polygon whose edges carry extra points exactly on, or within a few epsilons of, the edge. */
const subdividedPolygon: RingGenerator = (random) => {
  const cornerCount = 3 + Math.floor(random() * 6);
  const corners = Array.from({ length: cornerCount }, (_, index): CapPoint2 => {
    const angle = (index / cornerCount) * Math.PI * 2;
    return [Math.cos(angle) * 0.5, Math.sin(angle) * 0.5];
  });
  const ring: CapPoint2[] = [];
  for (const [index, corner] of corners.entries()) {
    ring.push(corner);
    const next = corners[(index + 1) % cornerCount]!;
    const extraCount = Math.floor(random() * 8);
    for (let extra = 1; extra <= extraCount; extra++) {
      const offset = random() < 0.5 ? 0 : (random() - 0.5) * 8 * referenceRingEpsilon;
      ring.push(pointBetween([corner, next], extra / (extraCount + 1), offset));
    }
  }
  // Rotate the start so collinear runs also wrap around the first vertex.
  const start = Math.floor(random() * ring.length);
  return [...ring.slice(start), ...ring.slice(0, start)];
};

/** Points scattered close to one line, with duplicates and non-finite values mixed in. */
const nearlyStraightRing: RingGenerator = (random) =>
  Array.from({ length: 3 + Math.floor(random() * 30) }, (): CapPoint2 => {
    const roll = random();
    if (roll < 0.05) {
      return [Number.NaN, random()];
    }
    if (roll < 0.1) {
      return [0, 0];
    }
    const t = random();
    return [t, t * 0.25 + (random() - 0.5) * 4 * referenceRingEpsilon];
  });

/** Irregular rings of random points on a small grid, so exact collinear triples and duplicates are common. */
const gridRing: RingGenerator = (random) =>
  Array.from(
    { length: 3 + Math.floor(random() * 20) },
    (): CapPoint2 => [Math.floor(random() * 4) / 4, Math.floor(random() * 4) / 4],
  );

const squareContour = (min: number, max: number, z = 0): THREE.Vector3[] => [
  new THREE.Vector3(min, min, z),
  new THREE.Vector3(max, min, z),
  new THREE.Vector3(max, max, z),
  new THREE.Vector3(min, max, z),
];

describe('section cap region projection', () => {
  it('should normalize far-from-origin cap polygons onto a shared stable plane basis', () => {
    const contour = squareContour(1_000_000_000, 1_000_000_004);
    const meshWorldMatrix = new THREE.Matrix4();
    const worldPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const basis = createSectionCutPlaneBasis({ worldPlane, sources: [{ closedContours: [contour], meshWorldMatrix }] });

    const result = buildSectionCapPolygon({
      sourceKey: 'source-a',
      ownerKey: 'owner-a',
      geometryKey: 'geometry-a',
      contours: [contour],
      meshWorldMatrix,
      planeBasis: basis,
      trueCut: true,
    });

    expect(basis.normalizationScale).toBeCloseTo(0.25, 6);
    expect(result.polygon.area).toBeCloseTo(1, 6);
    expect(result.polygon.trueCut).toBe(true);
    expect(result.polygon.bbox).toEqual({
      minX: -0.5,
      minY: -0.5,
      maxX: 0.5,
      maxY: 0.5,
    });
  });

  it('should normalize the basis to the contours of every source, each in its own mesh frame', () => {
    const basis = createSectionCutPlaneBasis({
      worldPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      sources: [
        { closedContours: [squareContour(0, 1)], meshWorldMatrix: new THREE.Matrix4() },
        { closedContours: [squareContour(0, 1)], meshWorldMatrix: new THREE.Matrix4().makeTranslation(3, 0, 0) },
      ],
    });

    expect(basis.normalizationOffset.toArray()).toEqual([2, 0.5]);
    expect(basis.normalizationScale).toBe(0.25);
  });

  it('should sanitize duplicate and collinear contour points before boolean input', () => {
    const ring = sanitizeCapRing([
      [0, 0],
      [0.5, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]);

    expect(ring).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
  });

  it.each([
    ['subdivided polygons', subdividedPolygon, 1],
    ['nearly straight rings', nearlyStraightRing, 2],
    ['grid rings', gridRing, 3],
  ] as const)('should sanitize %s exactly as the restarting scan did', (_label, generate, seed) => {
    const random = createSeededRandom(seed);
    let trimmedRingCount = 0;

    for (let ringIndex = 0; ringIndex < 2000; ringIndex++) {
      const ring = generate(random);
      const expected = sanitizeCapRingByRestartingScan(ring);
      expect(sanitizeCapRing(ring), JSON.stringify(ring)).toEqual(expected);
      if (expected.length > 0 && expected.length < prepareRingByReference(ring).length) {
        trimmedRingCount++;
      }
    }

    // Many rings keep an area after the collinear pass removed vertices from them, where removal order matters.
    expect(trimmedRingCount).toBeGreaterThan(500);
  });

  it.each([
    [
      'a triangle',
      [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
    ],
    [
      'a collinear triangle',
      [
        [0, 0],
        [0.5, 0],
        [1, 0],
      ],
      [],
    ],
    ['an entirely collinear ring', Array.from({ length: 12 }, (_, index): CapPoint2 => [index, index * 2]), []],
    [
      'a collinear run that wraps the first vertex',
      [
        [0.5, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
        [0.25, 0],
      ],
      [
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
    [
      'a ring whose last vertices lie on the edge back to the first',
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0.75],
        [0, 0.5],
        [0, 0.25],
      ],
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    ],
    [
      // Within the tolerance of the edge from the fourth vertex to the first, so removing the last vertex makes the
      // first one collinear.
      'a last vertex whose removal makes the first vertex collinear',
      [
        [0, 0.25],
        [0, -3.75],
        [4, -3.75],
        [4, 0.5],
        [0, 0.5],
        [3e-8, 0.375],
      ],
      [
        [0, -3.75],
        [4, -3.75],
        [4, 0.5],
        [0, 0.5],
      ],
    ],
  ] satisfies ReadonlyArray<readonly [string, CapPoint2[], CapPoint2[]]>)(
    'should sanitize %s exactly as the restarting scan did',
    (_label, ring, expected) => {
      expect(sanitizeCapRingByRestartingScan(ring)).toEqual(expected);
      expect(sanitizeCapRing(ring)).toEqual(expected);
    },
  );
});
