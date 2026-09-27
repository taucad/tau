// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSeededRandom } from '#components/geometry/loader/metal-morph-sequence.js';
import { resolveSectionFaces, resolveSectionPieces } from '#components/geometry/graphics/section-cuts.js';
import type { SectionCut, SectionFace, SectionPiece } from '#components/geometry/graphics/section-cuts.js';
import { defaultSectionCapBooleanOperations } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean.js';
import {
  buildSectionCapPolygon,
  buildSectionFaceEvidencePositions,
  capPointToWorld,
  createSectionCutPlaneBasis,
  measureCapMultiPolygonArea,
  sanitizeCapRing,
  sectionFaceWorldPlane,
  trimSectionCapPolygon,
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

// ── Cut faces on the cube [-1, 1]³, whose world frame is its mesh frame ──
const identity = new THREE.Matrix4();

/** The cube's section through the z axis at `degrees` from +X; for |degrees| ≤ 45 it leaves through x = ±1. */
const sectionThroughZ = (degrees: number): THREE.Vector3[] => {
  const angle = (degrees * Math.PI) / 180;
  const y = Math.tan(angle);
  return [
    new THREE.Vector3(-1, -y, -1),
    new THREE.Vector3(1, y, -1),
    new THREE.Vector3(1, y, 1),
    new THREE.Vector3(-1, -y, 1),
  ];
};

/** The cube's section by the plane x = 0. */
const xPlaneSection = [
  new THREE.Vector3(0, -1, -1),
  new THREE.Vector3(0, 1, -1),
  new THREE.Vector3(0, 1, 1),
  new THREE.Vector3(0, -1, 1),
];

const planeCut = (id: string, plane: 'xz' | 'yz', isFlipped = false): SectionCut => ({
  id,
  kind: 'plane',
  plane,
  offset: 0,
  isFlipped,
});

/** A face's cap on the cube, trimmed among the cuts, with its rings in world space and its world area. */
const trimCubeCap = (face: SectionFace, pieces: readonly SectionPiece[], section: readonly THREE.Vector3[]) => {
  const basis = createSectionCutPlaneBasis({
    worldPlane: sectionFaceWorldPlane(face),
    sources: [{ closedContours: [section], meshWorldMatrix: identity }],
  });
  const { polygon } = buildSectionCapPolygon({
    sourceKey: 'cube',
    ownerKey: 'cube',
    geometryKey: 'cube',
    contours: [section],
    meshWorldMatrix: identity,
    planeBasis: basis,
    trueCut: true,
  });
  const trimmed = trimSectionCapPolygon({
    multiPolygon: polygon.multiPolygon,
    basis,
    face,
    pieces,
    booleanOperations: defaultSectionCapBooleanOperations,
  });
  expect(trimmed.diagnostics).toEqual([]);
  return {
    basis,
    untrimmed: polygon.multiPolygon,
    trimmed: trimmed.multiPolygon,
    rings: trimmed.multiPolygon.flatMap((rings) =>
      rings.map((ring) => ring.map((point) => capPointToWorld(point, basis))),
    ),
    area: measureCapMultiPolygonArea(trimmed.multiPolygon) / basis.normalizationScale ** 2,
  };
};

/** How much of the z axis the rings' edges run along. */
const lengthOnAxis = (rings: ReadonlyArray<readonly THREE.Vector3[]>): number => {
  const isOnAxis = (point: THREE.Vector3): boolean => Math.hypot(point.x, point.y) < 1e-6;
  let length = 0;
  for (const ring of rings) {
    for (const [index, point] of ring.entries()) {
      const next = ring[(index + 1) % ring.length]!;
      if (isOnAxis(point) && isOnAxis(next)) {
        length += point.distanceTo(next);
      }
    }
  }
  return length;
};

describe('section cap faces among several cuts', () => {
  it('should leave the cap of a lone plane cut as it is', () => {
    const pieces = resolveSectionPieces([planeCut('cut-a', 'xz')]);
    const cap = trimCubeCap(resolveSectionFaces(pieces)[0]!, pieces, sectionThroughZ(0));

    expect(cap.trimmed).toBe(cap.untrimmed);
    expect(cap.area).toBeCloseTo(4, 6);
  });

  it('should cap two crossing planes once each over what the kept quadrant shows, meeting along the fold', () => {
    // Removes y > 0 and x > 0, keeping the quadrant x < 0, y < 0.
    const pieces = resolveSectionPieces([planeCut('cut-a', 'xz'), planeCut('cut-b', 'yz')]);
    const [faceA, faceB] = resolveSectionFaces(pieces);
    const capA = trimCubeCap(faceA!, pieces, sectionThroughZ(0));
    const capB = trimCubeCap(faceB!, pieces, xPlaneSection);

    // Each whole section is 2 × 2; the quadrant's cut surface is half of each, 4 in all.
    expect(capA.area).toBeCloseTo(2, 6);
    expect(capB.area).toBeCloseTo(2, 6);
    expect(capA.area + capB.area).toBeCloseTo(4, 6);
    // Neither cap reaches into what the other cut removes, so the two never overlap.
    expect(Math.max(...capA.rings.flat().map((point) => point.x))).toBeLessThan(1e-6);
    expect(Math.max(...capB.rings.flat().map((point) => point.y))).toBeLessThan(1e-6);
    // The fold between the faces, the z axis through the cube, bounds both caps.
    expect(lengthOnAxis(capA.rings)).toBeCloseTo(2, 6);
    expect(lengthOnAxis(capB.rings)).toBeCloseTo(2, 6);
  });

  it('should bound each face of a narrow cutaway at its axis', () => {
    const pieces = resolveSectionPieces([
      { id: 'cut-a', kind: 'revolution', axis: 'z', origin: [0, 0, 0], start: 0, sweep: 30 },
    ]);
    const [startFace, endFace] = resolveSectionFaces(pieces);
    const start = trimCubeCap(startFace!, pieces, sectionThroughZ(0));
    const end = trimCubeCap(endFace!, pieces, sectionThroughZ(30));
    const endDirection = new THREE.Vector3(Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0);

    // Half of each section: the half-plane from the axis out along the face's own direction.
    expect(start.area).toBeCloseTo(2, 6);
    expect(end.area).toBeCloseTo(2 / Math.cos(Math.PI / 6), 6);
    expect(Math.min(...start.rings.flat().map((point) => point.x))).toBeGreaterThan(-1e-6);
    expect(Math.min(...end.rings.flat().map((point) => point.dot(endDirection)))).toBeGreaterThan(-1e-6);
    expect(lengthOnAxis(start.rings)).toBeCloseTo(2, 6);
    expect(lengthOnAxis(end.rings)).toBeCloseTo(2, 6);
  });

  it('should cancel coincident faces that remove opposite sides', () => {
    const pieces = resolveSectionPieces([planeCut('cut-a', 'xz'), planeCut('cut-b', 'xz', true)]);
    const [faceA, faceB] = resolveSectionFaces(pieces);

    expect(trimCubeCap(faceA!, pieces, sectionThroughZ(0)).trimmed).toEqual([]);
    expect(trimCubeCap(faceB!, pieces, sectionThroughZ(0)).trimmed).toEqual([]);
  });

  it('should draw coincident faces that remove the same side once, from the earlier cut', () => {
    const pieces = resolveSectionPieces([planeCut('cut-a', 'xz'), planeCut('cut-b', 'xz')]);
    const [faceA, faceB] = resolveSectionFaces(pieces);

    expect(trimCubeCap(faceA!, pieces, sectionThroughZ(0)).area).toBeCloseTo(4, 6);
    expect(trimCubeCap(faceB!, pieces, sectionThroughZ(0)).trimmed).toEqual([]);
  });

  it('should keep the slice edges a face shows and drop those another cut removes', () => {
    const edge = [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)];
    const rounded = (positions: Float32Array): number[] =>
      [...positions].map((value) => Math.round(value * 1e6) / 1e6 + 0);
    const evidenceOnFirstFace = (cuts: readonly SectionCut[]): number[] => {
      const pieces = resolveSectionPieces(cuts);
      const face = resolveSectionFaces(pieces)[0]!;
      return rounded(
        buildSectionFaceEvidencePositions({
          openPolylines: [edge],
          meshWorldMatrix: identity,
          meshWorldInverse: identity,
          face,
          pieces,
          basis: createSectionCutPlaneBasis({
            worldPlane: sectionFaceWorldPlane(face),
            sources: [{ closedContours: [sectionThroughZ(0)], meshWorldMatrix: identity }],
          }),
        }),
      );
    };

    expect(evidenceOnFirstFace([planeCut('cut-a', 'xz')])).toEqual([-1, 0, 0, 1, 0, 0]);
    // The second cut removes x > 0, so the face shows the edge only up to the fold.
    expect(evidenceOnFirstFace([planeCut('cut-a', 'xz'), planeCut('cut-b', 'yz')])).toEqual([-1, 0, 0, 0, 0, 0]);
  });
});
