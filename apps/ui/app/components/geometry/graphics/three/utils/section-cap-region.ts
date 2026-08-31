import * as THREE from 'three';
import { buildPlaneBasis } from '#components/geometry/graphics/three/utils/earcut-contour.js';
import type { ClosedContour } from '#components/geometry/graphics/three/utils/plane-mesh-contour.js';
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
  worldPoints?: readonly THREE.Vector3[];
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

export const sanitizeCapRing = (ring: readonly CapPoint2[]): CapRing => {
  const finite: CapRing = [];
  const epsilonSquared = ringEpsilon * ringEpsilon;

  for (const point of ring) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      continue;
    }

    const next: CapPoint2 = [point[0], point[1]];
    const previous = finite.at(-1);
    if (!previous || pointDistanceSquared(previous, next) > epsilonSquared) {
      finite.push(next);
    }
  }

  while (finite.length > 1 && pointDistanceSquared(finite[0]!, finite.at(-1)!) <= epsilonSquared) {
    finite.pop();
  }

  let changed = true;
  while (changed && finite.length >= 3) {
    changed = false;
    for (let index = 0; index < finite.length; index++) {
      const previous = finite[(index + finite.length - 1) % finite.length]!;
      const current = finite[index]!;
      const next = finite[(index + 1) % finite.length]!;
      if (isCollinear(previous, current, next)) {
        finite.splice(index, 1);
        changed = true;
        break;
      }
    }
  }

  if (finite.length < 3 || Math.abs(signedRingArea(finite)) <= areaEpsilon) {
    return [];
  }

  return finite;
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

export const collectSectionCapWorldPoints = (options: {
  contours: readonly ClosedContour[];
  meshWorldMatrix: THREE.Matrix4;
}): THREE.Vector3[] => {
  const points: THREE.Vector3[] = [];
  for (const contour of options.contours) {
    for (const point of contour) {
      points.push(point.clone().applyMatrix4(options.meshWorldMatrix));
    }
  }

  return points;
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

  const projected = (options.worldPoints ?? []).map((point) => projectWorldPoint(point, baseBasis));
  if (projected.length === 0) {
    return baseBasis;
  }

  const bounds = buildBounds(projected);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const maxExtent = Math.max(width, height);

  return {
    ...baseBasis,
    normalizationOffset: new THREE.Vector2((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2),
    normalizationScale: maxExtent > ringEpsilon ? 1 / maxExtent : 1,
  };
};

export const denormalizeCapPoint = (
  point: CapPoint2,
  basis: SectionCutPlaneBasis,
): Readonly<{ u: number; v: number }> => ({
  u: point[0] / basis.normalizationScale + basis.normalizationOffset.x,
  v: point[1] / basis.normalizationScale + basis.normalizationOffset.y,
});

export const capPointToWorld = (point: CapPoint2, basis: SectionCutPlaneBasis): THREE.Vector3 => {
  const denormalized = denormalizeCapPoint(point, basis);
  return basis.origin.clone().addScaledVector(basis.u, denormalized.u).addScaledVector(basis.v, denormalized.v);
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
