import type { CoordinateConvention, SpatialBounds, SpatialMatrix, SpatialVector } from '@taucad/spatial';
import { resolveCoordinateTransform } from '@taucad/spatial';
import { createNodeIo } from '#gltf.utils.js';

const canonicalGltfWorld: CoordinateConvention = { up: '+y', forward: '+z', metersPerUnit: 1 };

type MutableBounds = { min: [number, number, number]; max: [number, number, number] };

const transformPoint = (matrix: readonly number[], point: SpatialVector): SpatialVector => [
  matrix[0]! * point[0] + matrix[4]! * point[1] + matrix[8]! * point[2] + matrix[12]!,
  matrix[1]! * point[0] + matrix[5]! * point[1] + matrix[9]! * point[2] + matrix[13]!,
  matrix[2]! * point[0] + matrix[6]! * point[1] + matrix[10]! * point[2] + matrix[14]!,
];

const corners = (min: readonly number[], max: readonly number[]): SpatialVector[] => [
  [min[0]!, min[1]!, min[2]!],
  [max[0]!, min[1]!, min[2]!],
  [min[0]!, max[1]!, min[2]!],
  [max[0]!, max[1]!, min[2]!],
  [min[0]!, min[1]!, max[2]!],
  [max[0]!, min[1]!, max[2]!],
  [min[0]!, max[1]!, max[2]!],
  [max[0]!, max[1]!, max[2]!],
];

const expandBounds = (bounds: MutableBounds, point: SpatialVector): void => {
  for (const index of [0, 1, 2] as const) {
    bounds.min[index] = Math.min(bounds.min[index], point[index]);
    bounds.max[index] = Math.max(bounds.max[index], point[index]);
  }
};

/** Options for {@link readGltfSceneBounds}. @public */
export type ReadGltfSceneBoundsOptions = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  targetWorld: CoordinateConvention;
}>;

/**
 * Reads the active glTF scene's conservative renderer-style world bounds.
 *
 * Each primitive's local POSITION AABB is transformed through its node hierarchy
 * before unioning, matching Three.js's non-precise `Box3.setFromObject` fit.
 *
 * @param options - GLB bytes and the caller world for the returned bounds.
 * @returns Scene bounds expressed in the caller world.
 * @public
 */
export const readGltfSceneBounds = async ({
  bytes,
  targetWorld,
}: ReadGltfSceneBoundsOptions): Promise<SpatialBounds> => {
  const io = await createNodeIo();
  const document = await io.readBinary(bytes);
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  const bounds: MutableBounds = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  };
  const coordinateMatrix: SpatialMatrix = resolveCoordinateTransform({
    source: canonicalGltfWorld,
    target: targetWorld,
  }).matrix;

  scene?.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) {
      return;
    }
    const worldMatrix = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position || position.getCount() === 0) {
        continue;
      }
      const min = position.getMinNormalized([]);
      const max = position.getMaxNormalized([]);
      if (![...min, ...max].every((value) => Number.isFinite(value))) {
        throw new RangeError('GLB default scene contains non-finite POSITION bounds');
      }
      for (const corner of corners(min, max)) {
        expandBounds(bounds, transformPoint(coordinateMatrix, transformPoint(worldMatrix, corner)));
      }
    }
  });

  if (![...bounds.min, ...bounds.max].every((value) => Number.isFinite(value))) {
    throw new RangeError('GLB default scene contains no finite POSITION bounds');
  }
  return bounds;
};
