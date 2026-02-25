import { createCoordinateTransform, createNodeIo, createScalingTransform } from '@taucad/converter';
import type { GeometryGltf } from '@taucad/types';
import { defineMiddleware } from '#middleware/kernel-middleware.js';

/**
 * Transform a single GLTF geometry from Y-up/meters to Z-up/millimeters.
 * Uses the converter's transform utilities which correctly handle both
 * mesh vertex data AND node TRS (translation, rotation, scale) properties.
 *
 * @param geometry - The GLTF geometry to transform
 * @returns The transformed geometry
 */
async function transformGltfGeometry(geometry: GeometryGltf): Promise<GeometryGltf> {
  const io = await createNodeIo();

  const document = await io.readBinary(geometry.content);

  await document.transform(createCoordinateTransform(), createScalingTransform());

  const transformedContent = await io.writeBinary(document);

  return {
    format: 'gltf',
    content: transformedContent,
  };
}

/**
 * Middleware that transforms GLTF geometries from Y-up/meters to Z-up/millimeters.
 *
 * All kernel workers produce valid GLTF files with Y-up coordinates and meter units
 * (per the glTF specification). This middleware transforms the output for UI rendering,
 * which expects Z-up coordinates and millimeter units.
 *
 * Uses wrap-style hook - calls handler() then transforms on the "return journey".
 * This ensures cached results from upstream middleware are also transformed.
 *
 * This creates a clean contract:
 * - Workers produce spec-compliant GLTF (Y-up, meters)
 * - Middleware handles UI-specific transformations
 * - Exports bypass the middleware and return valid GLTF files
 */
export const gltfCoordinateTransformMiddleware = defineMiddleware({
  name: 'GltfCoordinateTransform',

  async wrapCreateGeometry(input, handler, { logger }) {
    const result = await handler(input);

    if (!result.success || result.data.length === 0) {
      return result;
    }

    logger.trace('Transforming GLTF geometries to Z-up/mm');

    const transformedGeometries = await Promise.all(
      result.data.map(async (geometry) => {
        if (geometry.format === 'gltf') {
          return transformGltfGeometry(geometry);
        }

        return geometry;
      }),
    );

    return {
      ...result,
      data: transformedGeometries,
    };
  },
});
