import { transformPrimitive } from '@gltf-transform/functions';
import type { Accessor, mat4, vec4, Document, Primitive, PrimitiveTarget, Property } from '@gltf-transform/core';
import { resolveCoordinateTransform } from '@taucad/spatial';
import type { Volume } from '@gltf-transform/extensions';

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

/**
 * Rotate a 3-vector by a unit quaternion: v' = q·v·q⁻¹
 *
 * @param v - the 3-vector to rotate
 * @param q - the unit quaternion representing the rotation
 * @returns the rotated 3-vector
 */
function rotateVec3ByQuat(v: [number, number, number], q: Quat): [number, number, number] {
  const result = multiplyQuaternions(multiplyQuaternions(q, [v[0], v[1], v[2], 0]), invertUnitQuaternion(q));
  return [result[0], result[1], result[2]];
}

/**
 * Similarity transform on a quaternion: R' = q·R·q⁻¹
 *
 * @param r - the quaternion to conjugate
 * @param q - the quaternion to conjugate by
 * @returns the conjugated quaternion
 */
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
const gltfWorld = { up: '+y', forward: '+z', metersPerUnit: 1 } as const;
const tauWorld = { up: '+z', forward: '-y', metersPerUnit: 1 } as const;
const coordinateTransform = resolveCoordinateTransform({ source: gltfWorld, target: tauWorld });
export const gltfCoordinateTransformMatrix: mat4 = [...coordinateTransform.matrix];
const coordinateQuat: Quat = [...coordinateTransform.rotation];

/**
 * Gltf-transform matrix for meters to millimeters scaling
 */
const gltfScalingMatrix: mat4 = [1000, 0, 0, 0, 0, 1000, 0, 0, 0, 0, 1000, 0, 0, 0, 0, 1];

/**
 * Gltf-transform matrix for Z-up to Y-up coordinate transformation (reverse of Y-up to Z-up)
 * Matrix layout: column-major format (gltf-transform standard)
 */
const gltfReverseCoordinateTransformMatrix: mat4 = [...coordinateTransform.inverse];
const reverseCoordinateQuat: Quat = [...coordinateTransform.inverseRotation];

const transformTangentAccessor = (accessor: Accessor, matrix: mat4): void => {
  // Preserve source components while computing the direction; retain handedness.
  const element: number[] = [];
  for (let index = 0; index < accessor.getCount(); index++) {
    accessor.getElement(index, element);
    const [x, y, z] = element;
    const tx = matrix[0] * x! + matrix[4] * y! + matrix[8] * z!;
    const ty = matrix[1] * x! + matrix[5] * y! + matrix[9] * z!;
    const tz = matrix[2] * x! + matrix[6] * y! + matrix[10] * z!;
    const length = Math.hypot(tx, ty, tz) || 1;
    accessor.setElement(index, [tx / length, ty / length, tz / length, element[3]!]);
  }
};

const transformMorphDirectionAccessor = (accessor: Accessor, matrix: mat4): void => {
  const element: number[] = [];
  for (let index = 0; index < accessor.getCount(); index++) {
    accessor.getElement(index, element);
    const [x, y, z] = element;
    accessor.setElement(index, [
      matrix[0] * x! + matrix[4] * y! + matrix[8] * z!,
      matrix[1] * x! + matrix[5] * y! + matrix[9] * z!,
      matrix[2] * x! + matrix[6] * y! + matrix[10] * z!,
    ]);
  }
};

const transformDocumentMeshes = (document: Document, matrix: mat4, directionRotation?: mat4): void => {
  if (
    document
      .getRoot()
      .listNodes()
      .some((node) => node.getExtension('EXT_mesh_gpu_instancing'))
  ) {
    throw new Error(
      'Coordinate and unit transforms do not support EXT_mesh_gpu_instancing; use core shared mesh nodes.',
    );
  }
  const primitives = new Set(
    document
      .getRoot()
      .listMeshes()
      .flatMap((mesh) => mesh.listPrimitives()),
  );
  const roles = new Map<Accessor, string>();
  const transformOwners = new Set<Property>([document.getRoot()]);
  // Preflight all roles before writing shared storage or node placement.
  for (const primitive of primitives) {
    for (const owner of [primitive, ...primitive.listTargets()]) {
      const isTarget = owner !== primitive;
      transformOwners.add(owner);
      for (const semantic of owner.listSemantics()) {
        const accessor = owner.getAttribute(semantic);
        if (!accessor) {
          continue;
        }
        const transformedRole = semantic === 'POSITION' || semantic === 'NORMAL' || semantic === 'TANGENT';
        const expectedType = semantic === 'TANGENT' && !isTarget ? 'VEC4' : 'VEC3';
        if (transformedRole && accessor.getType() !== expectedType) {
          throw new Error(
            `${semantic} requires ${expectedType} for ${isTarget ? 'morph targets' : 'base attributes'}.`,
          );
        }
        const role = transformedRole
          ? isTarget && semantic !== 'POSITION'
            ? `morph-${semantic}`
            : semantic
          : 'untouched';
        const previousRole = roles.get(accessor);
        if (previousRole !== undefined && previousRole !== role) {
          throw new Error(`Shared accessor has incompatible transform roles: ${previousRole} and ${role}.`);
        }
        roles.set(accessor, role);
      }
    }
  }
  for (const primitive of primitives) {
    const indices = primitive.getIndices();
    if (indices && roles.has(indices) && roles.get(indices) !== 'untouched') {
      throw new Error('Shared accessor has incompatible transform roles: geometry and indices.');
    }
  }
  for (const [accessor, role] of roles) {
    if (role !== 'untouched' && accessor.listParents().some((parent) => !transformOwners.has(parent))) {
      throw new Error('Shared accessor has incompatible transform roles: geometry and an untransformed owner.');
    }
  }
  const transformed = new Set<Accessor>();
  for (const primitive of primitives) {
    const detached: Array<{ owner: Primitive | PrimitiveTarget; semantic: string; accessor: Accessor }> = [];
    for (const owner of [primitive, ...primitive.listTargets()]) {
      for (const semantic of ['POSITION', 'NORMAL', 'TANGENT']) {
        const accessor = owner.getAttribute(semantic);
        if (!accessor) {
          continue;
        }
        const morphDirection = owner !== primitive && semantic !== 'POSITION';
        if (morphDirection && !transformed.has(accessor)) {
          // These factories only apply L=sR, with positive uniform s and orthogonal R.
          // Normal inverse-transpose L^-T=R/s and tangent linear L=sR reduce to R
          // in the normalized base direction frame. Deltas retain magnitude and have no W.
          // Unit-only conversion leaves their bytes intact, including signed zero.
          if (directionRotation) {
            transformMorphDirectionAccessor(accessor, directionRotation);
          }
          transformed.add(accessor);
        } else if (semantic === 'TANGENT' && !transformed.has(accessor)) {
          transformTangentAccessor(accessor, matrix);
          transformed.add(accessor);
        }
        if (transformed.has(accessor)) {
          owner.setAttribute(semantic, null);
          detached.push({ owner, semantic, accessor });
        } else {
          transformed.add(accessor);
        }
      }
    }
    try {
      transformPrimitive(primitive, matrix);
    } finally {
      for (const { owner, semantic, accessor } of detached) {
        owner.setAttribute(semantic, accessor);
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Document-level rotation / scaling helpers
// ---------------------------------------------------------------------------

/**
 * Apply a rotation to the entire document: mesh vertices AND node TRS.
 *
 * For a rotation M with quaternion q:
 *   vertex  → M · vertex        (via transformPrimitive)
 *   t_node  → q · t_node · q⁻¹  (rotate translation vector)
 *   R_node  → q · R_node · q⁻¹  (similarity transform on rotation)
 *
 * @param document - the glTF document to transform
 * @param matrix - the rotation matrix to apply to mesh vertices
 * @param quaternion - the rotation quaternion to apply to node TRS
 */
function applyRotationToDocument(document: Document, matrix: mat4, quaternion: Quat): void {
  transformDocumentMeshes(document, matrix, matrix);

  for (const node of document.getRoot().listNodes()) {
    const t = node.getTranslation();
    node.setTranslation(rotateVec3ByQuat(t, quaternion));

    // These coordinate rotations permute axes; keep signed, nonuniform scale on the matching axis.
    const scale = node.getScale();
    node.setScale([
      Math.abs(matrix[0]) * scale[0] + Math.abs(matrix[4]) * scale[1] + Math.abs(matrix[8]) * scale[2],
      Math.abs(matrix[1]) * scale[0] + Math.abs(matrix[5]) * scale[1] + Math.abs(matrix[9]) * scale[2],
      Math.abs(matrix[2]) * scale[0] + Math.abs(matrix[6]) * scale[1] + Math.abs(matrix[10]) * scale[2],
    ]);

    const r = node.getRotation();
    node.setRotation(conjugateQuaternionBy(r, quaternion));
  }
}

/**
 * Apply a uniform scale to the entire document: mesh vertices AND node translations.
 *
 * Node rotations are unaffected by uniform scaling.
 *
 * @param document - the glTF document to transform
 * @param matrix - the scaling matrix to apply to mesh vertices
 * @param factor - the uniform scale factor to apply to node translations
 */
function applyUniformScaleToDocument(document: Document, matrix: mat4, factor: number): void {
  transformDocumentMeshes(document, matrix);

  for (const node of document.getRoot().listNodes()) {
    const t = node.getTranslation();
    node.setTranslation([t[0] * factor, t[1] * factor, t[2] * factor]);
  }
  for (const material of document.getRoot().listMaterials()) {
    const volume = material.getExtension<Volume>('KHR_materials_volume');
    if (volume) {
      volume.setThicknessFactor(volume.getThicknessFactor() * factor);
      volume.setAttenuationDistance(volume.getAttenuationDistance() * factor);
    }
  }
}

// ---------------------------------------------------------------------------
// Public transform factories
// ---------------------------------------------------------------------------

/**
 * Creates a gltf-transform document transform that rotates from Y-up to Z-up coordinates.
 *
 * @param shouldTransform - when `false` the returned function is a no-op (default `true`)
 * @returns A document transform function suitable for `document.transform()`.
 * @public
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
 * Creates a gltf-transform document transform that scales geometry from meters to millimeters.
 *
 * @param shouldTransform - when `false` the returned function is a no-op (default `true`)
 * @returns A document transform function suitable for `document.transform()`.
 * @public
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
 * Creates a gltf-transform document transform that rotates from Z-up back to Y-up coordinates.
 *
 * @param shouldTransform - when `false` the returned function is a no-op (default `true`)
 * @returns A document transform function suitable for `document.transform()`.
 * @public
 */
export function createReverseCoordinateTransform(shouldTransform = true): (document: Document) => void {
  return (document: Document): void => {
    if (!shouldTransform) {
      return;
    }

    applyRotationToDocument(document, gltfReverseCoordinateTransformMatrix, reverseCoordinateQuat);
  };
}
