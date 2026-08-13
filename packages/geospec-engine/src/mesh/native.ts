/**
 * The native mesh-metrics binding surface.
 *
 * Triangle soups are flattened here for native consumers that require the
 * shared-heap layout.
 *
 * @module
 */

import type { MeshTriangle } from '#mesh/types.js';

/**
 * A flat triangle soup as the native side reads it.
 *
 * @public
 */
export type GeoSpecNativeTriangleSoup = {
  /** `9 · triangleCount` coordinates: `[ax,ay,az,bx,by,bz,cx,cy,cz]` per triangle. */
  triangles: Float64Array<ArrayBuffer>;
  triangleCount: number;
};

/**
 * Per-triangle component labelling accompanying a soup.
 *
 * @public
 */
export type GeoSpecNativeComponentIds = Int32Array<ArrayBuffer>;

/**
 * Flatten mesh triangles into the native soup layout.
 *
 * @param triangles - Triangles in evidence order.
 * @returns `9 · n` coordinates, in the same order.
 * @public
 */
export const triangleSoupPositions = (triangles: readonly MeshTriangle[]): Float64Array<ArrayBuffer> => {
  const positions = new Float64Array(triangles.length * 9);
  let offset = 0;
  for (const triangle of triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      positions[offset++] = point[0];
      positions[offset++] = point[1];
      positions[offset++] = point[2];
    }
  }
  return positions;
};
