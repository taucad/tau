import { toRenderPoint } from '@taucad/spatial';
import type { RenderFrame } from '@taucad/spatial';

/**
 * Section cuts: the cut list a section view removes, as renderer-neutral geometry.
 *
 * Lengths are metres in the Tau root frame. Every cut removes a convex region or, for a cutaway wider than
 * 180°, two convex halves, so every test below is a plane test: no angle reaches a shader and nothing wraps at
 * 0°/360°. The removed volume is the union of the pieces.
 */

/** A section plane, named by the two axes it spans. */
export type SectionPlane = 'xy' | 'xz' | 'yz';

/** An axis of the Tau root frame. */
export type SectionAxis = 'x' | 'y' | 'z';

/** A point or direction: metres in the Tau root frame, or render units after {@link toRenderSectionPieces}. */
export type SectionVector = readonly [number, number, number];

/**
 * One cut of a section view.
 *
 * - `plane` removes its +axis side (xy +Z, xz +Y, yz +X), or its −axis side when flipped. `offset` is the plane's
 *   absolute coordinate along that axis, in metres.
 * - `revolution` removes the wedge from `start` through `start + sweep` degrees about `axis`, through `origin`
 *   (metres). Angle zero is +Y about X, +Z about Y and +X about Z; angles run counter-clockwise looking down the
 *   axis from its positive end. `sweep` stays within {@link minSectionSweep}–{@link maxSectionSweep}.
 */
export type SectionCut =
  | Readonly<{ id: string; kind: 'plane'; plane: SectionPlane; offset: number; isFlipped: boolean }>
  | Readonly<{
      id: string;
      kind: 'revolution';
      axis: SectionAxis;
      origin: [number, number, number];
      start: number;
      sweep: number;
    }>;

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

/** A cut's values without its identity: what persists, and what a value key covers. */
export type SectionCutValues = WithoutId<SectionCut>;

type PlaneCutFields = Omit<Extract<SectionCut, { kind: 'plane' }>, 'id' | 'kind'>;
type RevolutionCutFields = Omit<Extract<SectionCut, { kind: 'revolution' }>, 'id' | 'kind'>;

/**
 * Fields to change on one cut. A cut's kind never changes; fields of the other kind are ignored. A cutaway's origin
 * is fixed where it was added.
 */
export type SectionCutPatch = Partial<PlaneCutFields & Omit<RevolutionCutFields, 'origin'>>;

/** At most four cuts, so the pieces never exceed {@link maxSectionPieces}. */
export const maxSectionCuts = 4;

/** Four cutaways wider than 180° make eight convex pieces, the most the clip and headless capture take. */
export const maxSectionPieces = 8;

/** Degrees. The narrowest cutaway. */
export const minSectionSweep = 5;

/** Degrees. The widest cutaway: a full turn would remove the whole model. */
export const maxSectionSweep = 355;

/** Degrees. A new cutaway's sweep. */
export const defaultSectionSweep = 90;

/** The axis normal to each plane. */
export const sectionPlaneAxes: Readonly<Record<SectionPlane, SectionAxis>> = { xy: 'z', xz: 'y', yz: 'x' };

/** Each axis's index in a {@link SectionVector}. */
export const sectionAxisIndices: Readonly<Record<SectionAxis, 0 | 1 | 2>> = { x: 0, y: 1, z: 2 };

/** A new plane cut takes the first of these that the list does not have yet. */
const defaultPlaneOrder: readonly SectionPlane[] = ['xz', 'yz', 'xy'];

// Adding zero turns a negative zero into zero, so keys and equality never tell them apart.
const vector = (x: number, y: number, z: number): SectionVector => [x + 0, y + 0, z + 0];

const unitVectors: Readonly<Record<SectionAxis, SectionVector>> = {
  x: vector(1, 0, 0),
  y: vector(0, 1, 0),
  z: vector(0, 0, 1),
};

/** Angle zero about each axis. */
const angleZeroVectors: Readonly<Record<SectionAxis, SectionVector>> = {
  x: unitVectors.y,
  y: unitVectors.z,
  z: unitVectors.x,
};

const dot = (a: SectionVector, b: SectionVector): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const cross = (a: SectionVector, b: SectionVector): SectionVector =>
  vector(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);

const scale = (a: SectionVector, factor: number): SectionVector => vector(a[0] * factor, a[1] * factor, a[2] * factor);

const addScaled = (a: SectionVector, b: SectionVector, factor: number): SectionVector =>
  vector(a[0] + b[0] * factor, a[1] + b[1] * factor, a[2] + b[2] * factor);

const normalize = (a: SectionVector): SectionVector => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));

const radians = Math.PI / 180;

/** The unit direction `angle` radians about `axis` from its angle zero. */
const directionAt = (axis: SectionAxis, angle: number): SectionVector => {
  const zero = angleZeroVectors[axis];
  const quarter = cross(unitVectors[axis], zero);
  return addScaled(scale(zero, Math.cos(angle)), quarter, Math.sin(angle));
};

/** Degrees in [0, 360). */
const wrapDegrees = (degrees: number): number => (((degrees % 360) + 360) % 360) + 0;

const clampSweep = (sweep: number): number => Math.min(Math.max(sweep, minSectionSweep), maxSectionSweep);

// ---------------------------------------------------------------------------
// Pieces and faces
// ---------------------------------------------------------------------------

/** The points where `dot(normal, p) − constant > 0`. `normal` has unit length. */
export type SectionHalfSpace = Readonly<{ normal: SectionVector; constant: number }>;

/**
 * A cut face: part of the boundary of the removed volume. It lies on `plane`, whose normal points into the removed
 * side, and covers the points of that plane inside every bound. A plane face has no bounds; a cutaway face is a
 * half-plane bounded at the axis.
 */
export type SectionFace = Readonly<{ cutId: string; plane: SectionHalfSpace; bounds: readonly SectionHalfSpace[] }>;

/**
 * One convex removed region: the points inside all of its one or two half-spaces. `faces` are the cut faces on its
 * boundary; the plane shared by the two halves of a split cutaway is never one.
 */
export type SectionPiece = Readonly<{
  cutId: string;
  halfSpaces: readonly SectionHalfSpace[];
  faces: readonly SectionFace[];
}>;

const halfSpaceThrough = (normal: SectionVector, point: SectionVector): SectionHalfSpace => ({
  normal,
  constant: dot(normal, point) + 0,
});

const resolvePlanePiece = (cut: Extract<SectionCut, { kind: 'plane' }>): SectionPiece => {
  const sign = cut.isFlipped ? -1 : 1;
  const plane: SectionHalfSpace = {
    normal: scale(unitVectors[sectionPlaneAxes[cut.plane]], sign),
    constant: sign * cut.offset + 0,
  };
  return { cutId: cut.id, halfSpaces: [plane], faces: [{ cutId: cut.id, plane, bounds: [] }] };
};

const resolveRevolutionPieces = (cut: Extract<SectionCut, { kind: 'revolution' }>): SectionPiece[] => {
  const sweep = clampSweep(cut.sweep) * radians;
  const start = cut.start * radians;
  const axis = unitVectors[cut.axis];
  // A wedge past 180° is not convex, so it is removed as two convex halves; the plane they share is no face.
  const spans =
    sweep > Math.PI
      ? [
          { spanStart: start, spanSweep: sweep / 2, hasStartFace: true, hasEndFace: false },
          { spanStart: start + sweep / 2, spanSweep: sweep / 2, hasStartFace: false, hasEndFace: true },
        ]
      : [{ spanStart: start, spanSweep: sweep, hasStartFace: true, hasEndFace: true }];
  return spans.map(({ spanStart, spanSweep, hasStartFace, hasEndFace }) => {
    const startDirection = directionAt(cut.axis, spanStart);
    const endDirection = directionAt(cut.axis, spanStart + spanSweep);
    // Past the start plane turning forward, and short of the end plane.
    const startPlane = halfSpaceThrough(cross(axis, startDirection), cut.origin);
    const endPlane = halfSpaceThrough(scale(cross(axis, endDirection), -1), cut.origin);
    const faces: SectionFace[] = [];
    if (hasStartFace) {
      faces.push({ cutId: cut.id, plane: startPlane, bounds: [halfSpaceThrough(startDirection, cut.origin)] });
    }
    if (hasEndFace) {
      faces.push({ cutId: cut.id, plane: endPlane, bounds: [halfSpaceThrough(endDirection, cut.origin)] });
    }
    return { cutId: cut.id, halfSpaces: [startPlane, endPlane], faces };
  });
};

/**
 * The convex pieces the cuts remove, in cut order. A plane is one piece, a cutaway of 180° or less one wedge, and a
 * wider cutaway two halves.
 *
 * @throws RangeError when there are more than {@link maxSectionCuts} cuts: pieces are never dropped silently.
 */
export const resolveSectionPieces = (cuts: readonly SectionCut[]): SectionPiece[] => {
  if (cuts.length > maxSectionCuts) {
    throw new RangeError(`A section holds at most ${maxSectionCuts} cuts; received ${cuts.length}.`);
  }
  return cuts.flatMap((cut) => (cut.kind === 'plane' ? [resolvePlanePiece(cut)] : resolveRevolutionPieces(cut)));
};

/** Every cut face of the pieces, in piece order. */
export const resolveSectionFaces = (pieces: readonly SectionPiece[]): SectionFace[] =>
  pieces.flatMap((piece) => piece.faces);

/** Whether some piece removes `point`: every half-space of that piece holds it by more than `eps`. */
export const isSectionRemoved = (point: SectionVector, pieces: readonly SectionPiece[], eps = 0): boolean =>
  pieces.some((piece) => piece.halfSpaces.every(({ normal, constant }) => dot(normal, point) - constant > eps));

// ---------------------------------------------------------------------------
// Face-local 2D regions
// ---------------------------------------------------------------------------

/** A point in a face basis: `[u, v]`. */
export type SectionPoint2 = readonly [number, number];

/** An axis-aligned rectangle in a face basis. */
export type SectionRect = Readonly<{ min: SectionPoint2; max: SectionPoint2 }>;

/**
 * A face's plane coordinates. `normal` is the face's kept-side unit normal, the one a three.js clipping plane
 * keeps; `origin` is the plane's point nearest the frame origin; `u` and `v` span the plane exactly as the cap
 * pipeline's `buildPlaneBasis(normal)` does, so polygons here share the caps' plane coordinates.
 */
export type SectionFaceBasis = Readonly<{
  origin: SectionVector;
  normal: SectionVector;
  u: SectionVector;
  v: SectionVector;
}>;

export const resolveSectionFaceBasis = (face: SectionFace): SectionFaceBasis => {
  const normal = scale(face.plane.normal, -1);
  const reference = Math.abs(normal[2]) < 0.9 ? unitVectors.z : unitVectors.y;
  const u = normalize(cross(reference, normal));
  return { origin: scale(face.plane.normal, face.plane.constant), normal, u, v: cross(normal, u) };
};

/** Keeps the part of a convex polygon where `a·u + b·v + c > 0`. */
const clipPolygon = (
  polygon: readonly SectionPoint2[],
  [a, b, c]: readonly [number, number, number],
): SectionPoint2[] => {
  const clipped: SectionPoint2[] = [];
  for (const [index, point] of polygon.entries()) {
    const next = polygon[(index + 1) % polygon.length]!;
    const here = a * point[0] + b * point[1] + c;
    const there = a * next[0] + b * next[1] + c;
    if (here > 0) {
      clipped.push(point);
    }
    if (here > 0 !== there > 0) {
      const t = here / (here - there);
      clipped.push([point[0] + (next[0] - point[0]) * t, point[1] + (next[1] - point[1]) * t]);
    }
  }
  return clipped.length >= 3 ? clipped : [];
};

/** The part of `rect` (counter-clockwise) inside every half-space, on the plane through `origin` spanned by `u`, `v`. */
const clipRect = (
  rect: SectionRect,
  { origin, u, v }: Pick<SectionFaceBasis, 'origin' | 'u' | 'v'>,
  halfSpaces: readonly SectionHalfSpace[],
): SectionPoint2[] => {
  let polygon: SectionPoint2[] = [
    [rect.min[0], rect.min[1]],
    [rect.max[0], rect.min[1]],
    [rect.max[0], rect.max[1]],
    [rect.min[0], rect.max[1]],
  ];
  for (const { normal, constant } of halfSpaces) {
    polygon = clipPolygon(polygon, [dot(normal, u), dot(normal, v), dot(normal, origin) - constant]);
    if (polygon.length === 0) {
      return polygon;
    }
  }
  return polygon;
};

/** The face's own extent inside `rect`, a convex polygon in its basis (counter-clockwise; empty if none). */
export const resolveSectionFaceRegion = ({
  face,
  rect,
}: Readonly<{ face: SectionFace; rect: SectionRect }>): SectionPoint2[] =>
  clipRect(rect, resolveSectionFaceBasis(face), face.bounds);

type ResolveSectionFootprintOptions = Readonly<{
  face: SectionFace;
  /** A piece of another cut. */
  piece: SectionPiece;
  /** The bounds the footprint is clipped to, in the face basis. */
  rect: SectionRect;
  /**
   * Treat a half-space of `piece` that lies on the face's plane and faces the same way as holding the face, so the
   * footprint is where that piece's own face covers this one. Pass it when the piece's cut comes first in the list:
   * of two coincident faces, the earlier cut draws the cap.
   */
  shouldClaimCoplanar?: boolean;
  /** How far the face plane moves into its kept side, in the face's length unit. Defaults to 1e-6 of the rect. */
  eps?: number;
}>;

/**
 * Where `piece` removes material just behind a face: the convex polygon (face basis, counter-clockwise; empty if
 * none) of `piece` on the face plane moved `eps` into the face's kept side, clipped to `rect`. A cap is drawn only
 * where the kept side is solid, so a caller subtracts every other cut's footprints from the face.
 *
 * Parallel pieces cover the whole rectangle or nothing; a coplanar piece that removes the kept side covers it (the two
 * faces cancel); a coplanar piece facing the same way covers nothing unless `shouldClaimCoplanar`.
 */
export const resolveSectionFootprint = ({
  face,
  piece,
  rect,
  shouldClaimCoplanar = false,
  eps = 1e-6 * Math.max(rect.max[0] - rect.min[0], rect.max[1] - rect.min[1]),
}: ResolveSectionFootprintOptions): SectionPoint2[] => {
  const basis = resolveSectionFaceBasis(face);
  const halfSpaces = shouldClaimCoplanar
    ? piece.halfSpaces.filter(
        ({ normal, constant }) =>
          dot(normal, face.plane.normal) < 1 - 1e-9 || Math.abs(constant - face.plane.constant) > eps,
      )
    : piece.halfSpaces;
  return clipRect(rect, { ...basis, origin: addScaled(basis.origin, basis.normal, eps) }, halfSpaces);
};

// ---------------------------------------------------------------------------
// Defaults, edits and labels
// ---------------------------------------------------------------------------

/**
 * Whether a cut newly on `plane` is flipped, so that it removes the side facing the camera: an unflipped plane
 * removes its +axis side. `viewDirection` points from the view's target toward the camera; a camera level with the
 * plane, or no view, leaves it unflipped. Every new plane takes it: an added cut and a cut moved to another plane.
 */
export const resolveSectionPlaneFlip = (plane: SectionPlane, viewDirection: SectionVector | undefined): boolean =>
  (viewDirection?.[sectionAxisIndices[sectionPlaneAxes[plane]]] ?? 0) < 0;

type CreateDefaultPlaneCutOptions = Readonly<{
  id: string;
  /** The plane to add; defaults to the first of XZ, YZ and XY the list does not have. */
  plane?: SectionPlane;
  existing: readonly SectionCut[];
  /** The bounds centre the plane passes through, metres. */
  center: SectionVector;
  /** From the view's target toward the camera, as the camera view's `direction`. */
  viewDirection?: SectionVector;
}>;

/** A new plane cut through the bounds centre, flipped by {@link resolveSectionPlaneFlip}. */
export const createDefaultPlaneCut = ({
  id,
  plane,
  existing,
  center,
  viewDirection,
}: CreateDefaultPlaneCutOptions): Extract<SectionCut, { kind: 'plane' }> => {
  const used = new Set(existing.flatMap((cut) => (cut.kind === 'plane' ? [cut.plane] : [])));
  const chosen = plane ?? defaultPlaneOrder.find((candidate) => !used.has(candidate)) ?? 'xz';
  return {
    id,
    kind: 'plane',
    plane: chosen,
    offset: center[sectionAxisIndices[sectionPlaneAxes[chosen]]],
    isFlipped: resolveSectionPlaneFlip(chosen, viewDirection),
  };
};

type CreateDefaultRevolutionCutOptions = Readonly<{
  id: string;
  /** The viewer's up axis. */
  axis: SectionAxis;
  /** The bounds centre the axis passes through, metres. */
  center: SectionVector;
  /** From the view's target toward the camera, as the camera view's `direction`. */
  viewDirection?: SectionVector;
}>;

/**
 * A new cutaway about `axis` through the bounds centre, sweeping {@link defaultSectionSweep} degrees centred on the
 * camera around the axis, so it opens toward the camera. A camera looking along the axis starts it at 0°.
 */
export const createDefaultRevolutionCut = ({
  id,
  axis,
  center,
  viewDirection,
}: CreateDefaultRevolutionCutOptions): Extract<SectionCut, { kind: 'revolution' }> => {
  const zero = angleZeroVectors[axis];
  const quarter = cross(unitVectors[axis], zero);
  const across = viewDirection ? Math.hypot(dot(viewDirection, zero), dot(viewDirection, quarter)) : 0;
  const isAlongAxis = !viewDirection || across <= 1e-6 * Math.hypot(...viewDirection);
  const facing = isAlongAxis ? 0 : Math.atan2(dot(viewDirection, quarter), dot(viewDirection, zero)) / radians;
  return {
    id,
    kind: 'revolution',
    axis,
    origin: [center[0], center[1], center[2]],
    start: isAlongAxis ? 0 : wrapDegrees(Math.round(facing - defaultSectionSweep / 2)),
    sweep: defaultSectionSweep,
  };
};

const finiteOr = (value: number | undefined, current: number): number =>
  value !== undefined && Number.isFinite(value) ? value : current;

/**
 * Applies `patch` to `cut`, returning `cut` itself when no value changes. The sweep is clamped to
 * {@link minSectionSweep}–{@link maxSectionSweep}, the start wrapped into [0, 360), non-finite numbers are ignored,
 * and a new plane without an offset passes through `center`.
 */
export const applySectionCutPatch = (cut: SectionCut, patch: SectionCutPatch, center: SectionVector): SectionCut => {
  if (cut.kind === 'plane') {
    const plane = patch.plane ?? cut.plane;
    const offset =
      plane !== cut.plane && patch.offset === undefined
        ? center[sectionAxisIndices[sectionPlaneAxes[plane]]]
        : finiteOr(patch.offset, cut.offset);
    const isFlipped = patch.isFlipped ?? cut.isFlipped;
    return plane === cut.plane && offset === cut.offset && isFlipped === cut.isFlipped
      ? cut
      : { ...cut, plane, offset, isFlipped };
  }
  const axis = patch.axis ?? cut.axis;
  const start = patch.start === undefined ? cut.start : wrapDegrees(finiteOr(patch.start, cut.start));
  const sweep = patch.sweep === undefined ? cut.sweep : clampSweep(finiteOr(patch.sweep, cut.sweep));
  return axis === cut.axis && start === cut.start && sweep === cut.sweep ? cut : { ...cut, axis, start, sweep };
};

/** The cut's label: `XZ 12.3 mm` (the absolute offset through `formatLength`) or `90° about X`. */
export const describeSectionCut = (cut: SectionCutValues, formatLength: (metres: number) => string): string =>
  cut.kind === 'plane'
    ? `${cut.plane.toUpperCase()} ${formatLength(cut.offset)}`
    : `${Math.round(cut.sweep)}° about ${cut.axis.toUpperCase()}`;

// ---------------------------------------------------------------------------
// Value keys and render frames
// ---------------------------------------------------------------------------

/** A key over the cut's values, not its id: equal keys remove the same region. */
export const sectionCutKey = (cut: SectionCutValues): string =>
  cut.kind === 'plane'
    ? `plane:${cut.plane}:${cut.offset}:${cut.isFlipped}`
    : `revolution:${cut.axis}:${cut.origin.join(',')}:${cut.start}:${cut.sweep}`;

/** Whether two cut lists hold the same values in the same order, whatever their ids. */
export const areSectionCutsEqual = (left: readonly SectionCutValues[], right: readonly SectionCutValues[]): boolean =>
  left.length === right.length && left.every((cut, index) => sectionCutKey(cut) === sectionCutKey(right[index]!));

/** A key over one half-space's values, for caches keyed by a face plane. */
export const sectionHalfSpaceKey = ({ normal, constant }: SectionHalfSpace): string =>
  `${normal.join(',')},${constant}`;

/** A key over a piece list: its cuts, half-spaces and faces, so equal keys clip and cap alike. */
export const sectionPiecesKey = (pieces: readonly SectionPiece[]): string =>
  pieces
    .map(
      ({ cutId, halfSpaces, faces }) =>
        `${cutId}[${halfSpaces.map((halfSpace) => sectionHalfSpaceKey(halfSpace)).join(';')}|${faces
          .map(({ plane, bounds }) => [plane, ...bounds].map((halfSpace) => sectionHalfSpaceKey(halfSpace)).join('&'))
          .join(';')}]`,
    )
    .join('/');

/* The half-space's plane is moved like a point on it and its normal is kept, the mapping
 * `toThreeRenderPlane` applies to a plane. */
const toRenderHalfSpace = ({ normal, constant }: SectionHalfSpace, renderFrame: RenderFrame): SectionHalfSpace =>
  halfSpaceThrough(normal, toRenderPoint({ renderFrame, point: scale(normal, constant) }));

/** The pieces in a view's render frame, where the clip, caps and raycasts work. */
export const toRenderSectionPieces = (pieces: readonly SectionPiece[], renderFrame: RenderFrame): SectionPiece[] =>
  pieces.map(({ cutId, halfSpaces, faces }) => ({
    cutId,
    halfSpaces: halfSpaces.map((halfSpace) => toRenderHalfSpace(halfSpace, renderFrame)),
    faces: faces.map((face) => ({
      cutId: face.cutId,
      plane: toRenderHalfSpace(face.plane, renderFrame),
      bounds: face.bounds.map((bound) => toRenderHalfSpace(bound, renderFrame)),
    })),
  }));
