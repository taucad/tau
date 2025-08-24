import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { transformMesh } from '@gltf-transform/functions';
import type { mat4, Document } from '@gltf-transform/core';

/**
 * Shared gltf-transform utilities for applying coordinate system and scaling transformations
 */

/**
 * gltf-transform matrix for Y-up to Z-up coordinate transformation
 * Matrix layout: column-major format (gltf-transform standard)
 */
export const GLTF_COORDINATE_TRANSFORM_MATRIX: mat4 = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];

/**
 * Gltf-transform matrix for meters to millimeters scaling
 */
export const GLTF_SCALING_MATRIX: mat4 = [1000, 0, 0, 0, 0, 1000, 0, 0, 0, 0, 1000, 0, 0, 0, 0, 1];

/**
 * gltf-transform matrix for Z-up to Y-up coordinate transformation (reverse of Y-up to Z-up)
 * Matrix layout: column-major format (gltf-transform standard)
 */
export const GLTF_REVERSE_COORDINATE_TRANSFORM_MATRIX: mat4 = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];

/**
 * Gltf-transform matrix for millimeters to meters scaling (reverse of meters to millimeters)
 */
export const GLTF_REVERSE_SCALING_MATRIX: mat4 = [0.001, 0, 0, 0, 0, 0.001, 0, 0, 0, 0, 0.001, 0, 0, 0, 0, 1];

/**
 * Creates a custom transform for Y-up to Z-up coordinate system conversion
 */
export function createCoordinateTransform(shouldTransform = true): (document: Document) => void {
  const matrix = GLTF_COORDINATE_TRANSFORM_MATRIX;

  return (document: Document): void => {
    if (!shouldTransform) {
      return;
    }

    const meshes = document.getRoot().listMeshes();
    for (const mesh of meshes) {
      transformMesh(mesh, matrix);
    }
  };
}

/**
 * Creates a custom transform for meters to millimeters scaling
 */
export function createScalingTransform(shouldTransform = true): (document: Document) => void {
  const matrix = GLTF_SCALING_MATRIX;

  return (document: Document): void => {
    if (!shouldTransform) {
      return;
    }

    const meshes = document.getRoot().listMeshes();
    for (const mesh of meshes) {
      transformMesh(mesh, matrix);
    }
  };
}

/**
 * Creates a custom transform for Z-up to Y-up coordinate system conversion (reverse transform)
 */
export function createReverseCoordinateTransform(shouldTransform = true): (document: Document) => void {
  const matrix = GLTF_REVERSE_COORDINATE_TRANSFORM_MATRIX;

  return (document: Document): void => {
    if (!shouldTransform) {
      return;
    }

    const meshes = document.getRoot().listMeshes();
    for (const mesh of meshes) {
      transformMesh(mesh, matrix);
    }
  };
}

/**
 * Creates a custom transform for millimeters to meters scaling (reverse transform)
 */
export function createReverseScalingTransform(shouldTransform = true): (document: Document) => void {
  const matrix = GLTF_REVERSE_SCALING_MATRIX;

  return (document: Document): void => {
    if (!shouldTransform) {
      return;
    }

    const meshes = document.getRoot().listMeshes();
    for (const mesh of meshes) {
      transformMesh(mesh, matrix);
    }
  };
}

/**
 * Options for applying GLB transformations
 */
export type GlbTransformOptions = {
  transformYtoZup?: boolean;
  scaleMetersToMillimeters?: boolean;
};

/**
 * Applies coordinate and scaling transformations to GLB data
 * @param glbData - The input GLB data as Uint8Array
 * @param options - Transformation options
 * @returns Promise<Uint8Array> - The transformed GLB data
 */
export async function applyGlbTransforms(glbData: Uint8Array, options: GlbTransformOptions = {}): Promise<Uint8Array> {
  const { transformYtoZup = true, scaleMetersToMillimeters = true } = options;

  // Skip transformation if neither is enabled
  if (!transformYtoZup && !scaleMetersToMillimeters) {
    return glbData;
  }

  // Create NodeIO with extensions support
  const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);

  try {
    // Load the GLTF document
    const document = await io.readBinary(glbData);

    // Apply transformations using the proper transform approach
    await document.transform(
      createCoordinateTransform(transformYtoZup),
      createScalingTransform(scaleMetersToMillimeters),
    );

    // Export the transformed document back to GLB
    const transformedGlb = await io.writeBinary(document);
    return new Uint8Array(transformedGlb);
  } catch (error) {
    console.warn('[GLB Transforms] Failed to apply transformations:', error);
    // Return original data if transformation fails
    return glbData;
  }
}
