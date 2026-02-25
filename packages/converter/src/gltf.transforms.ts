import { NodeIO } from '@gltf-transform/core';
import { transformMesh } from '@gltf-transform/functions';
import type { mat4, vec4, Document } from '@gltf-transform/core';
import { allExtensions } from '#gltf.extensions.js';

/**
 * Shared gltf-transform utilities for applying coordinate system and scaling transformations.
 *
 * Both mesh vertex data AND node TRS properties are transformed so that the
 * full scene graph (including node hierarchy translations/rotations) is
 * correctly placed in the target coordinate system and unit scale.
 */

// ---------------------------------------------------------------------------
// Quaternion helpers (xyzw layout, matching glTF convention)
// ---------------------------------------------------------------------------

type Quat = vec4; // [x, y, z, w]

function multiplyQuaternions(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

function invertUnitQuaternion(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

/** Rotate a 3-vector by a unit quaternion: v' = q·v·q⁻¹ */
function rotateVec3ByQuat(v: [number, number, number], q: Quat): [number, number, number] {
  const result = multiplyQuaternions(multiplyQuaternions(q, [v[0], v[1], v[2], 0]), invertUnitQuaternion(q));
  return [result[0], result[1], result[2]];
}

/** Similarity transform on a quaternion: R' = q·R·q⁻¹ */
function conjugateQuaternionBy(r: Quat, q: Quat): Quat {
  return multiplyQuaternions(multiplyQuaternions(q, r), invertUnitQuaternion(q));
}

// ---------------------------------------------------------------------------
// Matrices & quaternions for coordinate / scaling transforms
// ---------------------------------------------------------------------------

/**
 * gltf-transform matrix for Y-up to Z-up coordinate transformation
 * Matrix layout: column-major format (gltf-transform standard)
 */
export const gltfCoordinateTransformMatrix: mat4 = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];

/** Quaternion for +90° rotation around X (Y-up → Z-up) */
const coordinateQuat: Quat = [Math.SQRT2 / 2, 0, 0, Math.SQRT2 / 2];

/**
 * Gltf-transform matrix for meters to millimeters scaling
 */
export const gltfScalingMatrix: mat4 = [1000, 0, 0, 0, 0, 1000, 0, 0, 0, 0, 1000, 0, 0, 0, 0, 1];

/**
 * Gltf-transform matrix for Z-up to Y-up coordinate transformation (reverse of Y-up to Z-up)
 * Matrix layout: column-major format (gltf-transform standard)
 */
export const gltfReverseCoordinateTransformMatrix: mat4 = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];

/** Quaternion for −90° rotation around X (Z-up → Y-up) */
const reverseCoordinateQuat: Quat = invertUnitQuaternion(coordinateQuat);

/**
 * Gltf-transform matrix for millimeters to meters scaling (reverse of meters to millimeters)
 */
export const gltfReverseScalingMatrix: mat4 = [0.001, 0, 0, 0, 0, 0.001, 0, 0, 0, 0, 0.001, 0, 0, 0, 0, 1];

// ---------------------------------------------------------------------------
// Document-level rotation / scaling helpers
// ---------------------------------------------------------------------------

/**
 * Apply a rotation to the entire document: mesh vertices AND node TRS.
 *
 * For a rotation M with quaternion q:
 *   vertex  → M · vertex        (via transformMesh)
 *   t_node  → q · t_node · q⁻¹  (rotate translation vector)
 *   R_node  → q · R_node · q⁻¹  (similarity transform on rotation)
 */
function applyRotationToDocument(document: Document, matrix: mat4, quaternion: Quat): void {
  for (const mesh of document.getRoot().listMeshes()) {
    transformMesh(mesh, matrix);
  }

  for (const node of document.getRoot().listNodes()) {
    const t = node.getTranslation();
    node.setTranslation(rotateVec3ByQuat(t, quaternion));

    const r = node.getRotation();
    node.setRotation(conjugateQuaternionBy(r, quaternion));
  }
}

/**
 * Apply a uniform scale to the entire document: mesh vertices AND node translations.
 *
 * Node rotations are unaffected by uniform scaling.
 */
function applyUniformScaleToDocument(document: Document, matrix: mat4, factor: number): void {
  for (const mesh of document.getRoot().listMeshes()) {
    transformMesh(mesh, matrix);
  }

  for (const node of document.getRoot().listNodes()) {
    const t = node.getTranslation();
    node.setTranslation([t[0] * factor, t[1] * factor, t[2] * factor]);
  }
}

// ---------------------------------------------------------------------------
// Public transform factories
// ---------------------------------------------------------------------------

/**
 * Creates a custom transform for Y-up to Z-up coordinate system conversion
 */
export function createCoordinateTransform(shouldTransform = true): (document: Document) => void {
  return (document: Document): void => {
    if (!shouldTransform) {
      return;
    }

    applyRotationToDocument(document, gltfCoordinateTransformMatrix, coordinateQuat);
  };
}

/**
 * Creates a custom transform for meters to millimeters scaling
 */
export function createScalingTransform(shouldTransform = true): (document: Document) => void {
  return (document: Document): void => {
    if (!shouldTransform) {
      return;
    }

    applyUniformScaleToDocument(document, gltfScalingMatrix, 1000);
  };
}

/**
 * Creates a custom transform for Z-up to Y-up coordinate system conversion (reverse transform)
 */
export function createReverseCoordinateTransform(shouldTransform = true): (document: Document) => void {
  return (document: Document): void => {
    if (!shouldTransform) {
      return;
    }

    applyRotationToDocument(document, gltfReverseCoordinateTransformMatrix, reverseCoordinateQuat);
  };
}

/**
 * Creates a custom transform for millimeters to meters scaling (reverse transform)
 */
export function createReverseScalingTransform(shouldTransform = true): (document: Document) => void {
  return (document: Document): void => {
    if (!shouldTransform) {
      return;
    }

    applyUniformScaleToDocument(document, gltfReverseScalingMatrix, 0.001);
  };
}

/**
 * Normalizes GLB data from Z-up coordinate system to Y-up (glTF spec-compliant).
 * Used by format-specific loaders that import from Z-up source formats.
 */
export async function normalizeGlbToYup(glbData: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const io = new NodeIO().registerExtensions(allExtensions);

  try {
    const document = await io.readBinary(glbData);
    await document.transform(createReverseCoordinateTransform());
    return await io.writeBinary(document);
  } catch (error) {
    console.warn('[GLB Transforms] Failed to normalize coordinates:', error);
    return glbData;
  }
}
