import * as THREE from 'three';
import type { ClosedContour } from '#components/geometry/graphics/three/utils/plane-mesh-contour.js';

const _arbitrary = /* @__PURE__ */ new THREE.Vector3();

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

/**
 * Projects a closed 3D contour to 2D (`ShapeUtils.triangulateShape`) and triangulates with
 * three.js's bundled Earcut (via `ShapeUtils` — no external dependency).
 */
export function triangulateContour(contour: ClosedContour, planeNormal: THREE.Vector3): TriangulatedContour {
  if (contour.length < 3) {
    return { positions: new Float32Array(), planeUv: new Float32Array(), indices: new Uint32Array() };
  }

  const { u, v } = buildPlaneBasis(planeNormal);

  const contour2d: THREE.Vector2[] = contour.map((point) => new THREE.Vector2(point.dot(u), point.dot(v)));

  const faces = THREE.ShapeUtils.triangulateShape(contour2d, []);

  const positions = new Float32Array(contour.length * 3);
  const planeUv = new Float32Array(contour.length * 2);
  for (const [index, point] of contour.entries()) {
    positions[index * 3] = point.x;
    positions[index * 3 + 1] = point.y;
    positions[index * 3 + 2] = point.z;

    const projected = contour2d[index]!;
    planeUv[index * 2] = projected.x;
    planeUv[index * 2 + 1] = projected.y;
  }

  const indices = new Uint32Array(faces.length * 3);
  let writeIndex = 0;
  for (const face of faces) {
    indices[writeIndex++] = face[0]!;
    indices[writeIndex++] = face[1]!;
    indices[writeIndex++] = face[2]!;
  }

  return { positions, planeUv, indices };
}

/**
 * Merges Earcut outputs for multiple closed loops in the same plane (mesh-local).
 */
export function mergeTriangulatedContours(
  contours: readonly ClosedContour[],
  planeNormal: THREE.Vector3,
): TriangulatedContour {
  let vertexCount = 0;
  let indexCount = 0;
  const parts: TriangulatedContour[] = [];
  for (const contour of contours) {
    const part = triangulateContour(contour, planeNormal);
    if (part.positions.length === 0) {
      continue;
    }

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
