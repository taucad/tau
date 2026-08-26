import * as THREE from 'three';
import type { SampledPoints } from '#components/geometry/splash/point-sampler.js';

/**
 * Target radius (world units) the normalized hero point cloud fills, so camera
 * framing is independent of the baked model's real-world scale.
 */
export const heroTargetRadius = 10;

/**
 * Center a sampled cloud at the origin and scale it to {@link heroTargetRadius},
 * so camera framing and pointer-interaction tuning are independent of the baked
 * GLB's units. Both gears share the source transform so they stay aligned
 * through the morph.
 */
export function normalizeSampledPoints(
  source: SampledPoints,
  target: SampledPoints,
): { source: SampledPoints; target: SampledPoints } {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let index = 0; index < source.positions.length; index += 3) {
    box.expandByPoint(point.set(source.positions[index]!, source.positions[index + 1]!, source.positions[index + 2]!));
  }

  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-6);
  const scale = heroTargetRadius / radius;

  const apply = (points: SampledPoints): SampledPoints => {
    const positions = new Float32Array(points.positions.length);
    for (let index = 0; index < points.positions.length; index += 3) {
      positions[index] = (points.positions[index]! - center.x) * scale;
      positions[index + 1] = (points.positions[index + 1]! - center.y) * scale;
      positions[index + 2] = (points.positions[index + 2]! - center.z) * scale;
    }

    return { positions, normals: points.normals, randomOffsets: points.randomOffsets };
  };

  return { source: apply(source), target: apply(target) };
}
