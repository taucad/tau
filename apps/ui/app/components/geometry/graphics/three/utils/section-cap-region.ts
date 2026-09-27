import * as THREE from 'three';
import { resolveSectionFaceRegion, resolveSectionFootprint } from '#components/geometry/graphics/section-cuts.js';
import type {
  SectionFace,
  SectionHalfSpace,
  SectionPiece,
  SectionPoint2,
  SectionRect,
} from '#components/geometry/graphics/section-cuts.js';
import { buildPlaneBasis } from '#components/geometry/graphics/three/utils/earcut-contour.js';
import { buildSectionContourBorderPositions } from '#components/geometry/graphics/three/utils/section-contour-border.js';
import type { ClosedContour, OpenPolyline } from '#components/geometry/graphics/three/utils/plane-mesh-contour.js';
import type {
  SectionCapBooleanOperations,
  SectionCapBooleanResult,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';
import type {
  CapMultiPolygon,
  CapPoint2,
  CapRing,
  SectionCapBbox,
  SectionCapDiagnostic,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

// Section rings are normalized to unit extent before these dimensionless guards apply.
const ringEpsilon = 1e-8;
const areaEpsilon = 1e-10;

const _worldPoint = /* @__PURE__ */ new THREE.Vector3();
const _delta = /* @__PURE__ */ new THREE.Vector3();
const _normalizedPlane = /* @__PURE__ */ new THREE.Plane();
const _denormalized = { u: 0, v: 0 };

export type SectionCutPlaneBasis = Readonly<{
  origin: THREE.Vector3;
  normal: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  planeKey: string;
  normalizationOffset: THREE.Vector2;
  normalizationScale: number;
}>;

export type SectionCapPolygon = Readonly<{
  sourceKey: string;
  ownerKey: string;
  geometryKey: string;
  multiPolygon: CapMultiPolygon;
  bbox: SectionCapBbox;
  area: number;
  trueCut: boolean;
  diagnostics: SectionCapDiagnostic[];
}>;

export type SectionCapBuildResult = Readonly<{
  sourceKey: string;
  polygon: SectionCapPolygon;
  sanitizedPlanePolygon: CapMultiPolygon;
  diagnostics: SectionCapDiagnostic[];
}>;

type ProjectedContour = {
  points: CapRing;
  signedArea: number;
  absoluteArea: number;
  bbox: SectionCapBbox;
  parentIndex: number | undefined;
  children: number[];
  depth: number;
};

type CreateSectionCutPlaneBasisOptions = Readonly<{
  worldPlane: THREE.Plane;
  /** The cap contours the basis is normalized to, each in the local space of its mesh. */
  sources?: ReadonlyArray<Readonly<{ closedContours: readonly ClosedContour[]; meshWorldMatrix: THREE.Matrix4 }>>;
}>;

type BuildSectionCapPolygonOptions = Readonly<{
  sourceKey: string;
  ownerKey: string;
  geometryKey: string;
  contours: readonly ClosedContour[];
  meshWorldMatrix: THREE.Matrix4;
  planeBasis: SectionCutPlaneBasis;
  trueCut: boolean;
}>;

const numericKey = (value: number): string => (Number.isFinite(value) ? value.toFixed(6) : String(value));

const signedRingArea = (ring: readonly CapPoint2[]): number => {
  let twiceArea = 0;
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index]!;
    const next = ring[(index + 1) % ring.length]!;
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }

  return twiceArea / 2;
};

export const measureCapRingArea = signedRingArea;

const buildBounds = (points: readonly CapPoint2[]): SectionCapBbox => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }

  return { minX, minY, maxX, maxY };
};

const emptyBounds = (): SectionCapBbox => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

export const mergeCapBounds = (bounds: readonly SectionCapBbox[]): SectionCapBbox => {
  const merged: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } = emptyBounds();
  for (const bbox of bounds) {
    merged.minX = Math.min(merged.minX, bbox.minX);
    merged.minY = Math.min(merged.minY, bbox.minY);
    merged.maxX = Math.max(merged.maxX, bbox.maxX);
    merged.maxY = Math.max(merged.maxY, bbox.maxY);
  }

  if (!Number.isFinite(merged.minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  return merged;
};

export const measureCapMultiPolygonArea = (multiPolygon: CapMultiPolygon): number => {
  let area = 0;
  for (const polygon of multiPolygon) {
    if (polygon.length === 0) {
      continue;
    }

    area += Math.abs(signedRingArea(polygon[0]!));
    for (let ringIndex = 1; ringIndex < polygon.length; ringIndex++) {
      area -= Math.abs(signedRingArea(polygon[ringIndex]!));
    }
  }

  return Math.max(0, area);
};

export const boundsForCapMultiPolygon = (multiPolygon: CapMultiPolygon): SectionCapBbox => {
  const bounds: SectionCapBbox[] = [];
  for (const polygon of multiPolygon) {
    for (const ring of polygon) {
      if (ring.length > 0) {
        bounds.push(buildBounds(ring));
      }
    }
  }

  return mergeCapBounds(bounds);
};

const pointDistanceSquared = (a: CapPoint2, b: CapPoint2): number => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
};

const isCollinear = (a: CapPoint2, b: CapPoint2, c: CapPoint2): boolean => {
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(area) <= ringEpsilon;
};

/**
 * Removes every vertex that is collinear with its two neighbours, in the order of a scan that restarts from the first
 * vertex after each removal, but in one pass. A removal changes only the triples centred on the removed vertex's
 * neighbours, so the scan resumes at the earlier neighbour. Removing the last vertex also changes the first vertex's
 * triple, so the scan then checks the first vertex and jumps back to the new last one: every vertex between them is
 * unchanged and already checked.
 */
const removeCollinearPoints = (points: CapRing): CapRing => {
  let { length } = points;
  if (length < 3) {
    return points;
  }

  const nextIndex = new Uint32Array(length);
  const previousIndex = new Uint32Array(length);
  for (let index = 0; index < length; index++) {
    nextIndex[index] = (index + 1) % length;
    previousIndex[index] = (index + length - 1) % length;
  }

  let head = 0;
  let tail = length - 1;
  let cursor = head;
  let isOnlyHeadAndTailUnchecked = false;
  while (length >= 3) {
    const before = previousIndex[cursor]!;
    const after = nextIndex[cursor]!;
    if (isCollinear(points[before]!, points[cursor]!, points[after]!)) {
      nextIndex[before] = after;
      previousIndex[after] = before;
      length--;
      if (cursor === head) {
        head = after;
        cursor = head;
      } else if (cursor === tail) {
        tail = before;
        cursor = head;
        isOnlyHeadAndTailUnchecked = true;
      } else {
        cursor = before;
      }
      continue;
    }

    if (cursor === tail) {
      break;
    }
    cursor = isOnlyHeadAndTailUnchecked ? tail : after;
  }

  const kept: CapRing = [];
  for (let index = head; kept.length < length; index = nextIndex[index]!) {
    kept.push(points[index]!);
  }

  return kept;
};

export const sanitizeCapRing = (ring: readonly CapPoint2[]): CapRing => {
  const finite: CapRing = [];
  const epsilonSquared = ringEpsilon * ringEpsilon;

  for (const point of ring) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      continue;
    }

    // Points are readonly tuples, so the sanitized ring shares them with its input.
    const previous = finite.at(-1);
    if (!previous || pointDistanceSquared(previous, point) > epsilonSquared) {
      finite.push(point);
    }
  }

  while (finite.length > 1 && pointDistanceSquared(finite[0]!, finite.at(-1)!) <= epsilonSquared) {
    finite.pop();
  }

  const kept = removeCollinearPoints(finite);
  if (kept.length < 3 || Math.abs(signedRingArea(kept)) <= areaEpsilon) {
    return [];
  }

  return kept;
};

const ensureRingWinding = (ring: CapRing, shouldBePositive: boolean): CapRing => {
  const isPositive = signedRingArea(ring) > 0;
  return isPositive === shouldBePositive ? ring : [...ring].reverse();
};

const boundsContainPoint = (bounds: SectionCapBbox, point: CapPoint2): boolean =>
  point[0] > bounds.minX + ringEpsilon &&
  point[0] < bounds.maxX - ringEpsilon &&
  point[1] > bounds.minY + ringEpsilon &&
  point[1] < bounds.maxY - ringEpsilon;

const polygonContainsPoint = (ring: readonly CapPoint2[], point: CapPoint2): boolean => {
  let inside = false;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index++) {
    const current = ring[index]!;
    const previous = ring[previousIndex]!;
    const crossesRay =
      current[1] > point[1] !== previous[1] > point[1] &&
      point[0] < ((previous[0] - current[0]) * (point[1] - current[1])) / (previous[1] - current[1]) + current[0];

    if (crossesRay) {
      inside = !inside;
    }
  }

  return inside;
};

const assignHierarchy = (contours: ProjectedContour[]): void => {
  for (const [childIndex, child] of contours.entries()) {
    const representativePoint = child.points[0]!;
    let parentIndex: number | undefined;
    let parentArea = Infinity;

    for (const [candidateIndex, candidate] of contours.entries()) {
      if (candidateIndex === childIndex || candidate.absoluteArea <= child.absoluteArea) {
        continue;
      }

      if (!boundsContainPoint(candidate.bbox, representativePoint)) {
        continue;
      }

      if (!polygonContainsPoint(candidate.points, representativePoint)) {
        continue;
      }

      if (candidate.absoluteArea < parentArea) {
        parentIndex = candidateIndex;
        parentArea = candidate.absoluteArea;
      }
    }

    child.parentIndex = parentIndex;
  }

  for (const [childIndex, child] of contours.entries()) {
    if (child.parentIndex !== undefined) {
      contours[child.parentIndex]!.children.push(childIndex);
    }
  }

  const computeDepth = (index: number): number => {
    const contour = contours[index]!;
    if (contour.parentIndex === undefined) {
      contour.depth = 0;
      return contour.depth;
    }

    contour.depth = computeDepth(contour.parentIndex) + 1;
    return contour.depth;
  };

  for (const index of contours.keys()) {
    computeDepth(index);
  }
};

const projectWorldPoint = (point: THREE.Vector3, basis: SectionCutPlaneBasis): CapPoint2 => {
  _delta.copy(point).sub(basis.origin);
  const u = _delta.dot(basis.u);
  const v = _delta.dot(basis.v);
  return [
    (u - basis.normalizationOffset.x) * basis.normalizationScale,
    (v - basis.normalizationOffset.y) * basis.normalizationScale,
  ];
};

export const createSectionCutPlaneBasis = (options: CreateSectionCutPlaneBasisOptions): SectionCutPlaneBasis => {
  _normalizedPlane.copy(options.worldPlane).normalize();
  const normal = _normalizedPlane.normal.clone();
  const origin = normal.clone().multiplyScalar(-_normalizedPlane.constant);
  const { u, v } = buildPlaneBasis(normal);
  const baseBasis = {
    origin,
    normal,
    u,
    v,
    planeKey: [
      numericKey(normal.x),
      numericKey(normal.y),
      numericKey(normal.z),
      numericKey(_normalizedPlane.constant),
    ].join(','),
    normalizationOffset: new THREE.Vector2(0, 0),
    normalizationScale: 1,
  } satisfies SectionCutPlaneBasis;

  // The contours' bounds in the unnormalized basis, projected through one scratch point.
  let pointCount = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const source of options.sources ?? []) {
    for (const contour of source.closedContours) {
      for (const point of contour) {
        _delta.copy(point).applyMatrix4(source.meshWorldMatrix).sub(origin);
        const projectedU = _delta.dot(u);
        const projectedV = _delta.dot(v);
        minX = Math.min(minX, projectedU);
        minY = Math.min(minY, projectedV);
        maxX = Math.max(maxX, projectedU);
        maxY = Math.max(maxY, projectedV);
        pointCount++;
      }
    }
  }

  if (pointCount === 0) {
    return baseBasis;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const maxExtent = Math.max(width, height);

  return {
    ...baseBasis,
    normalizationOffset: new THREE.Vector2((minX + maxX) / 2, (minY + maxY) / 2),
    normalizationScale: maxExtent > ringEpsilon ? 1 / maxExtent : 1,
  };
};

/** Writes the plane coordinates of a normalized cap point into `target`. */
export const denormalizeCapPoint = (
  point: CapPoint2,
  basis: SectionCutPlaneBasis,
  target: { u: number; v: number },
): Readonly<{ u: number; v: number }> => {
  target.u = point[0] / basis.normalizationScale + basis.normalizationOffset.x;
  target.v = point[1] / basis.normalizationScale + basis.normalizationOffset.y;
  return target;
};

export const capPointToWorld = (
  point: CapPoint2,
  basis: SectionCutPlaneBasis,
  target = new THREE.Vector3(),
): THREE.Vector3 => {
  const denormalized = denormalizeCapPoint(point, basis, _denormalized);
  return target.copy(basis.origin).addScaledVector(basis.u, denormalized.u).addScaledVector(basis.v, denormalized.v);
};

const projectContoursToPolygon = (options: BuildSectionCapPolygonOptions): ProjectedContour[] => {
  const projected: ProjectedContour[] = [];

  for (const contour of options.contours) {
    if (contour.length < 3) {
      continue;
    }

    const ring: CapRing = [];
    for (const point of contour) {
      _worldPoint.copy(point).applyMatrix4(options.meshWorldMatrix);
      ring.push(projectWorldPoint(_worldPoint, options.planeBasis));
    }

    const sanitized = sanitizeCapRing(ring);
    if (sanitized.length === 0) {
      continue;
    }

    const signedArea = signedRingArea(sanitized);
    const absoluteArea = Math.abs(signedArea);
    projected.push({
      points: sanitized,
      signedArea,
      absoluteArea,
      bbox: buildBounds(sanitized),
      parentIndex: undefined,
      children: [],
      depth: 0,
    });
  }

  assignHierarchy(projected);
  return projected;
};

export const buildSectionCapPolygon = (options: BuildSectionCapPolygonOptions): SectionCapBuildResult => {
  const diagnostics: SectionCapDiagnostic[] = [];
  const projectedContours = projectContoursToPolygon(options);
  const multiPolygon: CapMultiPolygon = [];

  for (const contour of projectedContours) {
    if (contour.depth % 2 !== 0) {
      continue;
    }

    const polygon: CapRing[] = [ensureRingWinding(contour.points, true)];
    for (const childIndex of contour.children) {
      const child = projectedContours[childIndex]!;
      if (child.depth === contour.depth + 1) {
        polygon.push(ensureRingWinding(child.points, false));
      }
    }

    multiPolygon.push(polygon);
  }

  if (multiPolygon.length === 0 && options.contours.length > 0) {
    diagnostics.push({
      code: 'empty-after-sanitize',
      message: 'Section cap contours were extracted but no finite positive-area polygon survived sanitation.',
      sourceKey: options.sourceKey,
    });
  }

  const polygon = {
    sourceKey: options.sourceKey,
    ownerKey: options.ownerKey,
    geometryKey: options.geometryKey,
    multiPolygon,
    bbox: boundsForCapMultiPolygon(multiPolygon),
    area: measureCapMultiPolygonArea(multiPolygon),
    trueCut: options.trueCut,
    diagnostics,
  } satisfies SectionCapPolygon;

  return {
    sourceKey: options.sourceKey,
    polygon,
    sanitizedPlanePolygon: multiPolygon,
    diagnostics,
  };
};

// ---------------------------------------------------------------------------
// Cut faces: what each face's cap shows among the other cuts
// ---------------------------------------------------------------------------

/** A face's kept-side plane: the three.js plane its sources are sliced through and its cap basis is built on. */
export const sectionFaceWorldPlane = (face: SectionFace, target = new THREE.Plane()): THREE.Plane => {
  const [x, y, z] = face.plane.normal;
  target.normal.set(-x, -y, -z);
  target.constant = face.plane.constant;
  return target;
};

/** The square, in a face's plane coordinates, that holds every point of its caps: normalized cap points lie within ±0.5. */
const resolveFaceCapRect = (basis: SectionCutPlaneBasis): SectionRect => {
  const { x: offsetU, y: offsetV } = basis.normalizationOffset;
  const halfSize = 1 / basis.normalizationScale;
  return { min: [offsetU - halfSize, offsetV - halfSize], max: [offsetU + halfSize, offsetV + halfSize] };
};

/** How far into a face's kept side the other cuts are tested: a millionth of the cap square, as footprints are. */
const resolveFaceEpsilon = (rect: SectionRect): number => 1e-6 * (rect.max[0] - rect.min[0]);

type TrimSectionCapPolygonOptions = Readonly<{
  /** The face's cap on one source, in the normalized coordinates of `basis`. */
  multiPolygon: CapMultiPolygon;
  /** The face's cap basis, built on {@link sectionFaceWorldPlane}. */
  basis: SectionCutPlaneBasis;
  face: SectionFace;
  /** Every piece of the cut set, in cut order. The face's own cut never trims it. */
  pieces: readonly SectionPiece[];
  booleanOperations: SectionCapBooleanOperations;
}>;

/**
 * The part of a face's cap that the face shows: inside the face's extent and outside every other cut's footprint, so
 * caps meet at the folds between faces and never cover one another. Of two coincident faces removing the same side the
 * earlier cut draws the cap, and coincident faces removing opposite sides cancel. A face nothing trims keeps its cap.
 */
export const trimSectionCapPolygon = ({
  multiPolygon,
  basis,
  face,
  pieces,
  booleanOperations,
}: TrimSectionCapPolygonOptions): SectionCapBooleanResult => {
  const { x: offsetU, y: offsetV } = basis.normalizationOffset;
  const scale = basis.normalizationScale;
  const rect = resolveFaceCapRect(basis);
  const eps = resolveFaceEpsilon(rect);
  const toCapPolygon = (polygon: readonly SectionPoint2[]): CapMultiPolygon => [
    [polygon.map(([u, v]): CapPoint2 => [(u - offsetU) * scale, (v - offsetV) * scale])],
  ];
  const ownIndex = pieces.findIndex((piece) => piece.cutId === face.cutId);
  const footprints = pieces.flatMap((piece, index) => {
    if (piece.cutId === face.cutId) {
      return [];
    }
    const footprint = resolveSectionFootprint({ face, piece, rect, shouldClaimCoplanar: index < ownIndex, eps });
    return footprint.length === 0 ? [] : [toCapPolygon(footprint)];
  });

  let result: SectionCapBooleanResult = { multiPolygon, diagnostics: [] };
  if (multiPolygon.length > 0 && face.bounds.length > 0) {
    const region = resolveSectionFaceRegion({ face, rect });
    result =
      region.length === 0
        ? { multiPolygon: [], diagnostics: [] }
        : booleanOperations.intersectCapPolygons(multiPolygon, toCapPolygon(region));
  }
  if (result.multiPolygon.length > 0 && footprints.length > 0) {
    const difference = booleanOperations.differenceCapPolygon(result.multiPolygon, footprints);
    result = { multiPolygon: difference.multiPolygon, diagnostics: [...result.diagnostics, ...difference.diagnostics] };
  }
  return result;
};

const _segmentStart = /* @__PURE__ */ new THREE.Vector3();
const _segmentEnd = /* @__PURE__ */ new THREE.Vector3();
const _segmentMiddle = /* @__PURE__ */ new THREE.Vector3();
const _segmentPoint = /* @__PURE__ */ new THREE.Vector3();

/** How far `point` lies inside the half-space: positive inside. */
const depthIn = (point: THREE.Vector3, { normal, constant }: SectionHalfSpace): number =>
  point.x * normal[0] + point.y * normal[1] + point.z * normal[2] - constant;

type BuildSectionFaceEvidencePositionsOptions = Readonly<{
  /** Slice edges lying in the face's plane, in the local space of their mesh. */
  openPolylines: readonly OpenPolyline[];
  meshWorldMatrix: THREE.Matrix4;
  meshWorldInverse: THREE.Matrix4;
  face: SectionFace;
  pieces: readonly SectionPiece[];
  /** The face's cap basis; the other cuts are tested as far into its kept side as its caps are trimmed. */
  basis: SectionCutPlaneBasis;
}>;

/**
 * Segment end pairs (mesh-local) for the slice edges that lie in a face's plane, keeping only the parts the face shows:
 * inside its extent and outside every other cut's pieces, tested `eps` into its kept side, as its cap is trimmed.
 */
export const buildSectionFaceEvidencePositions = ({
  openPolylines,
  meshWorldMatrix,
  meshWorldInverse,
  face,
  pieces,
  basis,
}: BuildSectionFaceEvidencePositionsOptions): Float32Array => {
  const others = pieces.filter((piece) => piece.cutId !== face.cutId);
  const planes = [...face.bounds, ...others.flatMap((piece) => piece.halfSpaces)];
  if (planes.length === 0) {
    return buildSectionContourBorderPositions({ closedContours: [], openPolylines });
  }

  const eps = resolveFaceEpsilon(resolveFaceCapRect(basis));
  const [x, y, z] = face.plane.normal;
  const positions: number[] = [];
  const pushPoint = (t: number): void => {
    _segmentPoint.lerpVectors(_segmentStart, _segmentEnd, t).applyMatrix4(meshWorldInverse);
    positions.push(_segmentPoint.x, _segmentPoint.y, _segmentPoint.z);
  };
  for (const polyline of openPolylines) {
    for (let index = 0; index + 1 < polyline.length; index++) {
      _segmentStart.copy(polyline[index]!).applyMatrix4(meshWorldMatrix);
      _segmentEnd.copy(polyline[index + 1]!).applyMatrix4(meshWorldMatrix);
      // Split where the segment crosses a plane bounding what the face shows; keep each part whose middle it shows.
      const splits = [0, 1];
      for (const halfSpace of planes) {
        const atStart = depthIn(_segmentStart, halfSpace);
        const atEnd = depthIn(_segmentEnd, halfSpace);
        if (atStart > 0 !== atEnd > 0) {
          splits.push(atStart / (atStart - atEnd));
        }
      }
      splits.sort((left, right) => left - right);
      for (let split = 0; split + 1 < splits.length; split++) {
        const from = splits[split]!;
        const to = splits[split + 1]!;
        _segmentMiddle.lerpVectors(_segmentStart, _segmentEnd, (from + to) / 2);
        _segmentMiddle.set(_segmentMiddle.x - x * eps, _segmentMiddle.y - y * eps, _segmentMiddle.z - z * eps);
        const isShown =
          to - from > 1e-9 &&
          face.bounds.every((bound) => depthIn(_segmentMiddle, bound) > 0) &&
          !others.some((piece) => piece.halfSpaces.every((halfSpace) => depthIn(_segmentMiddle, halfSpace) > 0));
        if (isShown) {
          pushPoint(from);
          pushPoint(to);
        }
      }
    }
  }
  return new Float32Array(positions);
};
