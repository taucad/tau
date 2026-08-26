import * as THREE from 'three';
import type { ClosedContour } from '#components/geometry/graphics/three/utils/plane-mesh-contour.js';

const _arbitrary = /* @__PURE__ */ new THREE.Vector3();
const containmentEpsilon = 1e-9;

/** Right-handed orthonormal basis `(u, v)` spanning the plane orthogonal to `normal`. */
export function buildPlaneBasis(normal: THREE.Vector3): Readonly<{ u: THREE.Vector3; v: THREE.Vector3 }> {
  const n = normal.clone().normalize();
  if (Math.abs(n.z) < 0.9) {
    _arbitrary.set(0, 0, 1);
  } else {
    _arbitrary.set(0, 1, 0);
  }

  const u = new THREE.Vector3().crossVectors(_arbitrary, n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();

  return { u, v };
}

/**
 * Triangulated cap mesh in mesh-local 3D plus the plane-local 2D projection used as
 * the `aPlaneUv` vertex attribute so the striped material stays diagonal regardless
 * of the section plane's orientation in mesh space.
 */
export type TriangulatedContour = {
  positions: Float32Array;
  /** `[u0,v0,u1,v1,...]` — one (u, v) per vertex in `positions`, anchored to the plane basis. */
  planeUv: Float32Array;
  indices: Uint32Array;
};

type ProjectedContour = {
  contour: ClosedContour;
  points2d: THREE.Vector2[];
  signedArea: number;
  absoluteArea: number;
  bbox: Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>;
  parentIndex: number | undefined;
  children: number[];
  depth: number;
};

function signedArea2d(points: readonly THREE.Vector2[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index++) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += current.x * next.y - next.x * current.y;
  }

  return twiceArea / 2;
}

function buildBounds(points: readonly THREE.Vector2[]): ProjectedContour['bbox'] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}

function boundsContainPoint(bounds: ProjectedContour['bbox'], point: THREE.Vector2): boolean {
  return (
    point.x > bounds.minX + containmentEpsilon &&
    point.x < bounds.maxX - containmentEpsilon &&
    point.y > bounds.minY + containmentEpsilon &&
    point.y < bounds.maxY - containmentEpsilon
  );
}

function pointIsOnSegment(point: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2): boolean {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > containmentEpsilon) {
    return false;
  }

  const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
  if (dot < containmentEpsilon) {
    return false;
  }

  const squaredLength = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot < squaredLength - containmentEpsilon;
}

function polygonContainsPoint(polygon: readonly THREE.Vector2[], point: THREE.Vector2): boolean {
  let inside = false;

  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index++) {
    const current = polygon[index]!;
    const previous = polygon[previousIndex]!;

    if (pointIsOnSegment(point, previous, current)) {
      return false;
    }

    const crossesRay =
      current.y > point.y !== previous.y > point.y &&
      point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;

    if (crossesRay) {
      inside = !inside;
    }
  }

  return inside;
}

function projectContours(contours: readonly ClosedContour[], planeNormal: THREE.Vector3): ProjectedContour[] {
  const { u, v } = buildPlaneBasis(planeNormal);
  const projected: ProjectedContour[] = [];

  for (const contour of contours) {
    if (contour.length < 3) {
      continue;
    }

    const points2d = contour.map((point) => new THREE.Vector2(point.dot(u), point.dot(v)));
    const signedArea = signedArea2d(points2d);
    const absoluteArea = Math.abs(signedArea);
    if (absoluteArea <= containmentEpsilon) {
      continue;
    }

    projected.push({
      contour,
      points2d,
      signedArea,
      absoluteArea,
      bbox: buildBounds(points2d),
      parentIndex: undefined,
      children: [],
      depth: 0,
    });
  }

  return projected;
}

function assignContourHierarchy(contours: ProjectedContour[]): void {
  for (const [childIndex, child] of contours.entries()) {
    const representativePoint = child.points2d[0]!;
    let parentIndex: number | undefined;
    let parentArea = Infinity;

    for (const [candidateIndex, candidate] of contours.entries()) {
      if (candidateIndex === childIndex || candidate.absoluteArea <= child.absoluteArea) {
        continue;
      }

      if (!boundsContainPoint(candidate.bbox, representativePoint)) {
        continue;
      }

      if (!polygonContainsPoint(candidate.points2d, representativePoint)) {
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
}

type CopyContourVerticesOptions = Readonly<{
  contour: ProjectedContour;
  positions: Float32Array;
  planeUv: Float32Array;
  vertexOffset: number;
}>;

function copyContourVertices(options: CopyContourVerticesOptions): void {
  const { contour, positions, planeUv, vertexOffset } = options;
  for (const [index, point] of contour.contour.entries()) {
    const writeIndex = vertexOffset + index;
    positions[writeIndex * 3] = point.x;
    positions[writeIndex * 3 + 1] = point.y;
    positions[writeIndex * 3 + 2] = point.z;

    const projected = contour.points2d[index]!;
    planeUv[writeIndex * 2] = projected.x;
    planeUv[writeIndex * 2 + 1] = projected.y;
  }
}

/**
 * Merges Earcut outputs for multiple closed loops in the same plane (mesh-local).
 *
 * Containment is significant: odd-depth loops are holes in their smallest containing
 * even-depth parent, and even-depth loops nested inside holes become filled islands.
 */
export function mergeTriangulatedContours(
  contours: readonly ClosedContour[],
  planeNormal: THREE.Vector3,
): TriangulatedContour {
  const projectedContours = projectContours(contours, planeNormal);
  assignContourHierarchy(projectedContours);

  let vertexCount = 0;
  let indexCount = 0;
  const parts: TriangulatedContour[] = [];

  for (const contour of projectedContours) {
    if (contour.depth % 2 !== 0) {
      continue;
    }

    const holeIndexes = contour.children.filter(
      (childIndex) => projectedContours[childIndex]!.depth === contour.depth + 1,
    );
    const holes = holeIndexes.map((childIndex) => projectedContours[childIndex]!.points2d);
    const faces = THREE.ShapeUtils.triangulateShape(contour.points2d, holes);
    if (faces.length === 0) {
      continue;
    }

    const localVertexCount =
      contour.contour.length +
      holeIndexes.reduce((sum, childIndex) => sum + projectedContours[childIndex]!.contour.length, 0);
    const positions = new Float32Array(localVertexCount * 3);
    const planeUv = new Float32Array(localVertexCount * 2);

    let localVertexOffset = 0;
    copyContourVertices({ contour, positions, planeUv, vertexOffset: localVertexOffset });
    localVertexOffset += contour.contour.length;

    for (const childIndex of holeIndexes) {
      const hole = projectedContours[childIndex]!;
      copyContourVertices({ contour: hole, positions, planeUv, vertexOffset: localVertexOffset });
      localVertexOffset += hole.contour.length;
    }

    const indices = new Uint32Array(faces.length * 3);
    let faceWriteIndex = 0;
    for (const face of faces) {
      indices[faceWriteIndex++] = face[0]!;
      indices[faceWriteIndex++] = face[1]!;
      indices[faceWriteIndex++] = face[2]!;
    }

    const part = { positions, planeUv, indices };
    parts.push(part);
    vertexCount += part.positions.length / 3;
    indexCount += part.indices.length;
  }

  if (vertexCount === 0) {
    return { positions: new Float32Array(), planeUv: new Float32Array(), indices: new Uint32Array() };
  }

  const positions = new Float32Array(vertexCount * 3);
  const planeUv = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexWrite = 0;
  let indexBase = 0;

  for (const part of parts) {
    const verticesInPart = part.positions.length / 3;
    positions.set(part.positions, vertexOffset * 3);
    planeUv.set(part.planeUv, vertexOffset * 2);
    for (let i = 0; i < part.indices.length; i++) {
      indices[indexWrite + i] = part.indices[i]! + indexBase;
    }

    indexWrite += part.indices.length;
    indexBase += verticesInPart;
    vertexOffset += verticesInPart;
  }

  return { positions, planeUv, indices };
}
