import { WebIO } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { EXTManifold } from 'manifold-3d/manifold-gltf';

type Vector = readonly [number, number, number];
type WorldAxis = `${'+' | '-'}${'x' | 'y' | 'z'}`;
type TargetWorld = Readonly<{ up: WorldAxis; forward: WorldAxis; metersPerUnit: number }>;
type Bounds = Readonly<{ min: Vector; max: Vector }>;
type MutableBounds = { min: [number, number, number]; max: [number, number, number] };

const transformPoint = (matrix: readonly number[], point: Vector): Vector => [
  matrix[0]! * point[0] + matrix[4]! * point[1] + matrix[8]! * point[2] + matrix[12]!,
  matrix[1]! * point[0] + matrix[5]! * point[1] + matrix[9]! * point[2] + matrix[13]!,
  matrix[2]! * point[0] + matrix[6]! * point[1] + matrix[10]! * point[2] + matrix[14]!,
];

const axisVector = (axis: WorldAxis): Vector => {
  const sign = axis.startsWith('+') ? 1 : -1;
  return axis.endsWith('x') ? [sign, 0, 0] : axis.endsWith('y') ? [0, sign, 0] : [0, 0, sign];
};

const cross = (left: Vector, right: Vector): Vector => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

const toTargetWorld = (point: Vector, target: TargetWorld): Vector => {
  const up = axisVector(target.up);
  const forward = axisVector(target.forward);
  const right = cross(up, forward);
  const scale = 1 / target.metersPerUnit;
  return [
    (right[0] * point[0] + up[0] * point[1] + forward[0] * point[2]) * scale,
    (right[1] * point[0] + up[1] * point[1] + forward[1] * point[2]) * scale,
    (right[2] * point[0] + up[2] * point[1] + forward[2] * point[2]) * scale,
  ];
};

const corners = (min: readonly number[], max: readonly number[]): Vector[] => [
  [min[0]!, min[1]!, min[2]!],
  [max[0]!, min[1]!, min[2]!],
  [min[0]!, max[1]!, min[2]!],
  [max[0]!, max[1]!, min[2]!],
  [min[0]!, min[1]!, max[2]!],
  [max[0]!, min[1]!, max[2]!],
  [min[0]!, max[1]!, max[2]!],
  [max[0]!, max[1]!, max[2]!],
];

const expandBounds = (bounds: MutableBounds, point: Vector): void => {
  for (const index of [0, 1, 2] as const) {
    bounds.min[index] = Math.min(bounds.min[index], point[index]);
    bounds.max[index] = Math.max(bounds.max[index], point[index]);
  }
};

/** Reads conservative active-scene bounds from in-memory GLB bytes without Node I/O. */
export const readGltfSceneBounds = async ({
  bytes,
  targetWorld,
}: Readonly<{ bytes: Uint8Array<ArrayBuffer>; targetWorld: TargetWorld }>): Promise<Bounds> => {
  const alignedBytes = bytes.byteOffset % 4 === 0 ? bytes : new Uint8Array(bytes);
  const document = await new WebIO().registerExtensions([KHRMaterialsUnlit, EXTManifold]).readBinary(alignedBytes);
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  const bounds: MutableBounds = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  };

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
        expandBounds(bounds, toTargetWorld(transformPoint(worldMatrix, corner), targetWorld));
      }
    }
  });

  if (![...bounds.min, ...bounds.max].every((value) => Number.isFinite(value))) {
    throw new RangeError('GLB default scene contains no finite POSITION bounds');
  }
  return bounds;
};
