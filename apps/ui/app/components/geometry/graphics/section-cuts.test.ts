import { describe, expect, it } from 'vitest';
import {
  applySectionCutPatch,
  areSectionCutsEqual,
  createDefaultPlaneCut,
  createDefaultRevolutionCut,
  describeSectionCut,
  isSectionRemoved,
  maxSectionCuts,
  maxSectionPieces,
  resolveSectionFaceBasis,
  resolveSectionFaceRegion,
  resolveSectionFaces,
  resolveSectionFootprint,
  resolveSectionPieces,
  sectionCutKey,
  sectionPiecesKey,
  toRenderSectionPieces,
} from '#components/geometry/graphics/section-cuts.js';
import type {
  SectionAxis,
  SectionCut,
  SectionFace,
  SectionPlane,
  SectionPoint2,
  SectionRect,
  SectionVector,
} from '#components/geometry/graphics/section-cuts.js';

const plane = (id: string, name: SectionPlane, offset: number): SectionCut => ({
  id,
  kind: 'plane',
  plane: name,
  offset,
  isFlipped: false,
});

const flippedPlane = (id: string, name: SectionPlane, offset: number): SectionCut => ({
  id,
  kind: 'plane',
  plane: name,
  offset,
  isFlipped: true,
});

const revolution = (
  id: string,
  axis: SectionAxis,
  { start, sweep, origin = [0, 0, 0] }: Readonly<{ start: number; sweep: number; origin?: [number, number, number] }>,
): SectionCut => ({ id, kind: 'revolution', axis, origin, start, sweep });

const removes = (cuts: readonly SectionCut[], point: SectionVector): boolean =>
  isSectionRemoved(point, resolveSectionPieces(cuts));

/** A point at `degrees` about Z from +X, one metre out, at height `z`. */
const aboutZ = (degrees: number, z = 0): SectionVector => [
  Math.cos((degrees * Math.PI) / 180),
  Math.sin((degrees * Math.PI) / 180),
  z,
];

const polygonArea = (polygon: readonly SectionPoint2[]): number => {
  let area = 0;
  for (const [index, [u, v]] of polygon.entries()) {
    const [nextU, nextV] = polygon[(index + 1) % polygon.length]!;
    area += (u * nextV - nextU * v) / 2;
  }
  return area;
};

/** The mean of the vertices: inside a convex polygon. */
const polygonCentroid = (polygon: readonly SectionPoint2[]): SectionPoint2 => {
  let u = 0;
  let v = 0;
  for (const point of polygon) {
    u += point[0] / polygon.length;
    v += point[1] / polygon.length;
  }
  return [u, v];
};

/** The 3D point at `[u, v]` of the face basis, moved `depth` into the face's kept side. */
const facePoint = (face: SectionFace, [u, v]: SectionPoint2, depth = 0): SectionVector => {
  const basis = resolveSectionFaceBasis(face);
  const at = (index: 0 | 1 | 2): number =>
    basis.origin[index] + basis.u[index] * u + basis.v[index] * v + basis.normal[index] * depth;
  return [at(0), at(1), at(2)];
};

const unitRect: SectionRect = { min: [-1, -1], max: [1, 1] };

const onlyFace = (cut: SectionCut): SectionFace => {
  const [face] = resolveSectionFaces(resolveSectionPieces([cut]));
  expect(face).toBeDefined();
  return face!;
};

describe('section cut pieces', () => {
  it.each([
    ['xy', [0, 0, 1]],
    ['xz', [0, 1, 0]],
    ['yz', [1, 0, 0]],
  ] as const)('should remove the +axis side of an unflipped %s plane and the other side when flipped', (name, axis) => {
    const beyond: SectionVector = [axis[0] * 0.3, axis[1] * 0.3, axis[2] * 0.3];
    const short: SectionVector = [axis[0] * 0.1, axis[1] * 0.1, axis[2] * 0.1];

    expect(removes([plane('a', name, 0.2)], beyond)).toBe(true);
    expect(removes([plane('a', name, 0.2)], short)).toBe(false);
    expect(removes([flippedPlane('a', name, 0.2)], beyond)).toBe(false);
    expect(removes([flippedPlane('a', name, 0.2)], short)).toBe(true);
  });

  it('should measure a plane offset along its axis from the frame origin, not from the model', () => {
    const [piece] = resolveSectionPieces([plane('a', 'xz', -0.05)]);

    expect(piece?.halfSpaces).toEqual([{ normal: [0, 1, 0], constant: -0.05 }]);
    expect(removes([plane('a', 'xz', -0.05)], [5, -0.04, 5])).toBe(true);
    expect(removes([plane('a', 'xz', -0.05)], [5, -0.06, 5])).toBe(false);
  });

  it('should remove a cutaway counter-clockwise from its start, looking down the axis from its positive end', () => {
    const cuts = [revolution('a', 'z', { start: 30, sweep: 60 })];

    expect(removes(cuts, aboutZ(60, 5))).toBe(true);
    expect(removes(cuts, aboutZ(20, 5))).toBe(false);
    expect(removes(cuts, aboutZ(100, 5))).toBe(false);
    // Angle zero is +Y about X and +Z about Y.
    expect(removes([revolution('a', 'x', { start: 0, sweep: 20 })], [0, 1, 0.1])).toBe(true);
    expect(removes([revolution('a', 'x', { start: 0, sweep: 20 })], [0, 1, -0.1])).toBe(false);
    expect(removes([revolution('a', 'y', { start: 0, sweep: 20 })], [0.1, 0, 1])).toBe(true);
    expect(removes([revolution('a', 'y', { start: 0, sweep: 20 })], [-0.1, 0, 1])).toBe(false);
  });

  it('should split a cutaway past 180° into two convex halves that remove the whole wedge', () => {
    const wide = [revolution('a', 'z', { start: 0, sweep: 270 })];

    expect(resolveSectionPieces(wide)).toHaveLength(2);
    expect(resolveSectionPieces([revolution('a', 'z', { start: 0, sweep: 180 })])).toHaveLength(1);
    for (const degrees of [10, 45, 170, 200, 225, 260]) {
      expect(removes(wide, aboutZ(degrees))).toBe(true);
    }
    for (const degrees of [280, 300, 350]) {
      expect(removes(wide, aboutZ(degrees))).toBe(false);
    }
  });

  it('should clamp a cutaway to 355° so a sliver of the model is always kept', () => {
    expect(removes([revolution('a', 'z', { start: 0, sweep: 400 })], aboutZ(357))).toBe(false);
    expect(removes([revolution('a', 'z', { start: 0, sweep: 400 })], aboutZ(353))).toBe(true);
    expect(removes([revolution('a', 'z', { start: 0, sweep: 1 })], aboutZ(4))).toBe(true);
  });

  it('should remove the union of two narrow cutaways, which one clip intersection cannot express', () => {
    const cuts = [revolution('a', 'z', { start: 0, sweep: 90 }), revolution('b', 'z', { start: 180, sweep: 90 })];

    expect(removes(cuts, [1, 1, 0])).toBe(true);
    expect(removes(cuts, [-1, -1, 0])).toBe(true);
    expect(removes(cuts, [1, -1, 0])).toBe(false);
    expect(removes(cuts, [-1, 1, 0])).toBe(false);
  });

  it('should keep points within eps of the removed region', () => {
    const pieces = resolveSectionPieces([plane('a', 'xy', 0)]);

    expect(isSectionRemoved([0, 0, 0.001], pieces)).toBe(true);
    expect(isSectionRemoved([0, 0, 0.001], pieces, 0.01)).toBe(false);
  });

  it('should hold four of the widest cutaways in the piece budget and refuse a fifth cut', () => {
    const four = ['a', 'b', 'c', 'd'].map((id) => revolution(id, 'z', { start: 0, sweep: 355 }));

    expect(resolveSectionPieces(four)).toHaveLength(maxSectionPieces);
    expect(() => resolveSectionPieces([...four, plane('e', 'xy', 0)])).toThrow(RangeError);
    expect(() => resolveSectionPieces([...four, plane('e', 'xy', 0)])).toThrow(`at most ${maxSectionCuts} cuts`);
  });

  it('should tag every piece with its cut', () => {
    const pieces = resolveSectionPieces([plane('a', 'xy', 0), revolution('b', 'x', { start: 0, sweep: 200 })]);

    expect(pieces.map((piece) => piece.cutId)).toEqual(['a', 'b', 'b']);
  });
});

describe('section cut faces', () => {
  it('should give a plane one unbounded face whose normal points into the removed side', () => {
    const faces = resolveSectionFaces(resolveSectionPieces([flippedPlane('a', 'xy', 0.1)]));

    expect(faces).toEqual([{ cutId: 'a', plane: { normal: [0, 0, -1], constant: -0.1 }, bounds: [] }]);
  });

  it('should bound a narrow cutaway start and end face at the axis, on the side the wedge opens', () => {
    const faces = resolveSectionFaces(resolveSectionPieces([revolution('a', 'z', { start: 0, sweep: 90 })]));

    expect(faces).toHaveLength(2);
    const [startFace, endFace] = faces;
    // The start face is the +X half of the XZ plane, the end face the +Y half of the YZ plane.
    const startRegion = resolveSectionFaceRegion({ face: startFace!, rect: unitRect });
    expect(polygonArea(startRegion)).toBeCloseTo(2);
    expect(facePoint(startFace!, polygonCentroid(startRegion))[0]).toBeGreaterThan(0);
    const endRegion = resolveSectionFaceRegion({ face: endFace!, rect: unitRect });
    expect(polygonArea(endRegion)).toBeCloseTo(2);
    expect(facePoint(endFace!, polygonCentroid(endRegion))[1]).toBeGreaterThan(0);
  });

  it('should never make a face of the plane a split cutaway shares between its halves', () => {
    const faces = resolveSectionFaces(resolveSectionPieces([revolution('a', 'z', { start: 0, sweep: 270 })]));

    expect(faces).toHaveLength(2);
    // The halves meet on the plane at 135°; its normal is ±(−sin 135°, cos 135°, 0).
    const middle: SectionVector = [-Math.sin((3 * Math.PI) / 4), Math.cos((3 * Math.PI) / 4), 0];
    for (const face of faces) {
      const alignment = Math.abs(
        face.plane.normal[0] * middle[0] + face.plane.normal[1] * middle[1] + face.plane.normal[2] * middle[2],
      );
      expect(alignment).toBeLessThan(0.99);
    }
  });
});

describe('section cut footprints', () => {
  const floor = onlyFace(plane('a', 'xy', 0));

  it('should cover the whole face or nothing for a parallel piece', () => {
    const [below] = resolveSectionPieces([plane('b', 'xy', -0.1)]);
    const [above] = resolveSectionPieces([plane('b', 'xy', 0.1)]);

    expect(polygonArea(resolveSectionFootprint({ face: floor, piece: below!, rect: unitRect }))).toBeCloseTo(4);
    expect(resolveSectionFootprint({ face: floor, piece: above!, rect: unitRect })).toEqual([]);
  });

  it('should cover the part of the face a crossing piece removes', () => {
    const [crossing] = resolveSectionPieces([plane('b', 'yz', 0.2)]);
    const footprint = resolveSectionFootprint({ face: floor, piece: crossing!, rect: unitRect });

    expect(polygonArea(footprint)).toBeCloseTo(0.8 * 2);
    // Just behind the face, the footprint is exactly what the piece removes.
    expect(isSectionRemoved(facePoint(floor, polygonCentroid(footprint), 1e-3), [crossing!])).toBe(true);
    expect(isSectionRemoved(facePoint(floor, [0, 0], 1e-3), [crossing!])).toBe(false);
  });

  it('should cover a quarter of the face for a narrow cutaway crossing it', () => {
    const [wedge] = resolveSectionPieces([revolution('b', 'z', { start: 0, sweep: 90 })]);
    const footprint = resolveSectionFootprint({ face: floor, piece: wedge!, rect: unitRect });

    expect(polygonArea(footprint)).toBeCloseTo(1);
    const [x, y] = facePoint(floor, polygonCentroid(footprint));
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
  });

  it('should cancel coplanar faces that remove opposite sides', () => {
    const facingDown = onlyFace(flippedPlane('b', 'xy', 0));
    const [removesAbove] = resolveSectionPieces([plane('a', 'xy', 0)]);
    const [removesBelow] = resolveSectionPieces([flippedPlane('b', 'xy', 0)]);

    expect(polygonArea(resolveSectionFootprint({ face: floor, piece: removesBelow!, rect: unitRect }))).toBeCloseTo(4);
    expect(
      polygonArea(resolveSectionFootprint({ face: facingDown, piece: removesAbove!, rect: unitRect })),
    ).toBeCloseTo(4);
  });

  it('should leave a coplanar face facing the same way to the earlier cut', () => {
    const [same] = resolveSectionPieces([plane('b', 'xy', 0)]);

    expect(resolveSectionFootprint({ face: floor, piece: same!, rect: unitRect })).toEqual([]);
    expect(
      polygonArea(resolveSectionFootprint({ face: floor, piece: same!, rect: unitRect, shouldClaimCoplanar: true })),
    ).toBeCloseTo(4);
  });

  it('should claim only the half-plane a coplanar cutaway face covers', () => {
    // The cutaway's start face is the +X half of the XZ plane and removes +Y, as an unflipped XZ plane does.
    const xzFace = onlyFace(plane('a', 'xz', 0));
    const [wedge] = resolveSectionPieces([revolution('b', 'z', { start: 0, sweep: 90 })]);
    const claimed = resolveSectionFootprint({ face: xzFace, piece: wedge!, rect: unitRect, shouldClaimCoplanar: true });

    expect(resolveSectionFootprint({ face: xzFace, piece: wedge!, rect: unitRect })).toEqual([]);
    expect(polygonArea(claimed)).toBeCloseTo(2);
    expect(facePoint(xzFace, polygonCentroid(claimed))[0]).toBeGreaterThan(0);
  });

  it('should share the cap basis: a kept-side normal with u and v as the cap plane basis builds them', () => {
    const basis = resolveSectionFaceBasis(floor);

    expect(basis.normal).toEqual([0, 0, -1]);
    expect(basis.u).toEqual([-1, 0, 0]);
    expect(basis.v).toEqual([0, 1, 0]);
    expect(resolveSectionFaceBasis(onlyFace(plane('a', 'xz', 0.3))).origin).toEqual([0, 0.3, 0]);
  });
});

describe('section cut defaults', () => {
  const center: SectionVector = [1, 2, 3];

  it('should add the first unused of XZ, YZ and XY through the bounds centre', () => {
    const first = createDefaultPlaneCut({ id: 'a', existing: [], center });
    const second = createDefaultPlaneCut({ id: 'b', existing: [first], center });
    const third = createDefaultPlaneCut({ id: 'c', existing: [first, second], center });
    const fourth = createDefaultPlaneCut({ id: 'd', existing: [first, second, third], center });

    expect([first, second, third, fourth].map((cut) => cut.plane)).toEqual(['xz', 'yz', 'xy', 'xz']);
    expect([first, second, third].map((cut) => cut.offset)).toEqual([2, 1, 3]);
    expect(createDefaultPlaneCut({ id: 'e', plane: 'xy', existing: [], center })).toMatchObject({
      plane: 'xy',
      offset: 3,
    });
  });

  it.each([
    ['looking down −Y', [0.2, 1, 0.3]],
    ['looking up +Y', [0.2, -1, 0.3]],
  ] as const)('should remove the side facing the camera when %s', (_label, viewDirection) => {
    const cut = createDefaultPlaneCut({ id: 'a', existing: [], center, viewDirection });
    const eye: SectionVector = [
      center[0] + viewDirection[0],
      center[1] + viewDirection[1],
      center[2] + viewDirection[2],
    ];

    expect(removes([cut], eye)).toBe(true);
  });

  it('should open a new cutaway toward the camera around the up axis, through the bounds centre', () => {
    const viewDirection: SectionVector = [0, 1, 0.5];
    const cut = createDefaultRevolutionCut({ id: 'a', axis: 'z', center, viewDirection });

    expect(cut).toEqual({ id: 'a', kind: 'revolution', axis: 'z', origin: [1, 2, 3], start: 45, sweep: 90 });
    expect(removes([cut], [center[0] + viewDirection[0], center[1] + viewDirection[1], center[2]])).toBe(true);
    expect(removes([cut], [center[0] - viewDirection[0], center[1] - viewDirection[1], center[2]])).toBe(false);
  });

  it('should start a cutaway at 0° when the camera looks along its axis or no view is known', () => {
    expect(createDefaultRevolutionCut({ id: 'a', axis: 'z', center, viewDirection: [0, 0, 2] }).start).toBe(0);
    expect(createDefaultRevolutionCut({ id: 'a', axis: 'y', center }).start).toBe(0);
  });
});

describe('section cut edits', () => {
  const center: SectionVector = [1, 2, 3];
  const planeCut = plane('a', 'xz', 0.5);
  const cutaway = revolution('b', 'x', { start: 10, sweep: 90, origin: [1, 2, 3] });

  it('should keep the same cut for a patch that changes no value', () => {
    expect(applySectionCutPatch(planeCut, { offset: 0.5, isFlipped: false }, center)).toBe(planeCut);
    expect(applySectionCutPatch(cutaway, { start: 370, sweep: 90 }, center)).toBe(cutaway);
    expect(applySectionCutPatch(cutaway, { offset: 4, isFlipped: true }, center)).toBe(cutaway);
    expect(applySectionCutPatch(planeCut, { offset: Number.NaN }, center)).toBe(planeCut);
  });

  it('should keep a cutaway on the origin it was added at', () => {
    // @ts-expect-error -- A patch has no origin: a cutaway's origin is fixed where it was added.
    expect(applySectionCutPatch(cutaway, { origin: [4, 5, 6] }, center)).toBe(cutaway);
  });

  it('should apply changed values, clamping the sweep and wrapping the start', () => {
    expect(applySectionCutPatch(planeCut, { offset: 0.25, isFlipped: true }, center)).toEqual({
      ...planeCut,
      offset: 0.25,
      isFlipped: true,
    });
    expect(applySectionCutPatch(cutaway, { sweep: 400, start: -30 }, center)).toMatchObject({ sweep: 355, start: 330 });
    expect(applySectionCutPatch(cutaway, { sweep: 1 }, center)).toMatchObject({ sweep: 5 });
  });

  it('should move a cut given a new plane and no offset through the bounds centre', () => {
    expect(applySectionCutPatch(planeCut, { plane: 'xy' }, center)).toMatchObject({ plane: 'xy', offset: 3 });
    expect(applySectionCutPatch(planeCut, { plane: 'yz', offset: 0.1 }, center)).toMatchObject({
      plane: 'yz',
      offset: 0.1,
    });
  });
});

describe('section cut labels and keys', () => {
  const formatLength = (metres: number): string => `${(metres * 1000).toFixed(1)} mm`;

  it('should label a plane with its absolute offset and a cutaway with its sweep and axis', () => {
    expect(describeSectionCut(plane('a', 'xz', 0.0123), formatLength)).toBe('XZ 12.3 mm');
    expect(describeSectionCut(plane('a', 'yz', -0.0123), formatLength)).toBe('YZ -12.3 mm');
    expect(describeSectionCut(plane('a', 'xy', 0), formatLength)).toBe('XY 0.0 mm');
    expect(describeSectionCut(revolution('b', 'x', { start: 10, sweep: 90.4 }), formatLength)).toBe('90° about X');
  });

  it('should key cuts by value, whatever their ids', () => {
    expect(sectionCutKey(plane('a', 'xz', 0.5))).toBe(sectionCutKey(plane('b', 'xz', 0.5)));
    expect(sectionCutKey(plane('a', 'xz', 0.5))).not.toBe(sectionCutKey(flippedPlane('a', 'xz', 0.5)));
    expect(sectionCutKey(revolution('a', 'x', { start: 10, sweep: 90 }))).not.toBe(
      sectionCutKey(revolution('a', 'x', { start: 10, sweep: 91 })),
    );
    expect(areSectionCutsEqual([plane('a', 'xz', 0.5)], [plane('b', 'xz', 0.5)])).toBe(true);
    expect(areSectionCutsEqual([plane('a', 'xz', 0.5)], [plane('a', 'xz', 0.6)])).toBe(false);
    expect(areSectionCutsEqual([plane('a', 'xz', 0.5)], [])).toBe(false);
  });

  it('should key pieces by what they clip and cap', () => {
    const cuts = [plane('a', 'xz', 0.5), revolution('b', 'z', { start: 0, sweep: 270 })];

    expect(sectionPiecesKey(resolveSectionPieces(cuts))).toBe(sectionPiecesKey(resolveSectionPieces([...cuts])));
    expect(sectionPiecesKey(resolveSectionPieces(cuts))).not.toBe(
      sectionPiecesKey(resolveSectionPieces([plane('a', 'xz', 0.4), cuts[1]!])),
    );
    // Two adjacent cutaways remove what one wide cutaway removes, but their faces differ.
    expect(sectionPiecesKey(resolveSectionPieces([revolution('a', 'z', { start: 0, sweep: 270 })]))).not.toBe(
      sectionPiecesKey(
        resolveSectionPieces([
          revolution('a', 'z', { start: 0, sweep: 135 }),
          revolution('a', 'z', { start: 135, sweep: 135 }),
        ]),
      ),
    );
  });
});

describe('section cut render frames', () => {
  it('should remove the same points after mapping pieces into a render frame', () => {
    const renderFrame = { anchorFrameId: 'tau:root', originMeters: [1, 2, 3], metersPerRenderUnit: 0.001 } as const;
    const pieces = resolveSectionPieces([
      plane('a', 'xz', 2.05),
      revolution('b', 'z', { start: 30, sweep: 60, origin: [1, 2, 3] }),
    ]);
    const renderPieces = toRenderSectionPieces(pieces, renderFrame);
    const toRender = (point: SectionVector): SectionVector => [
      (point[0] - 1) / 0.001,
      (point[1] - 2) / 0.001,
      (point[2] - 3) / 0.001,
    ];

    for (const point of [
      [1, 2.1, 3],
      [1.001, 2.01, 3],
      [1 + Math.cos(Math.PI / 3) * 0.01, 2 + Math.sin(Math.PI / 3) * 0.01, 3],
      [1.01, 1.99, 3],
    ] as const) {
      expect(isSectionRemoved(toRender(point), renderPieces)).toBe(isSectionRemoved(point, pieces));
    }
    expect(isSectionRemoved(toRender([1, 2.1, 3]), renderPieces)).toBe(true);
    expect(isSectionRemoved(toRender([1.001, 2.01, 3]), renderPieces)).toBe(true);
    expect(isSectionRemoved(toRender([1.01, 1.99, 3]), renderPieces)).toBe(false);
    expect(renderPieces[0]?.faces[0]?.plane.normal).toEqual([0, 1, 0]);
    expect(renderPieces[0]?.faces[0]?.plane.constant).toBeCloseTo(50, 9);
  });
});
