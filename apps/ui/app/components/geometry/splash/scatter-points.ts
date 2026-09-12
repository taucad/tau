import type { SampledPoints } from '#components/geometry/splash/point-sampler.js';

/**
 * Generates a uniformly-distributed scatter cloud of `pointCount` random points
 * inside a sphere of `radius`.
 *
 * Used by the auth splashback as the "atoms" cloud that converges into the
 * gear12 surface during loading and that the assembly disperses back into
 * during unloading. Volume distribution (cube-root radial sampling) reads as
 * "from all around" much more clearly than a sphere shell.
 */
export function generateScatterPoints(pointCount: number, radius: number): SampledPoints {
  const positions = new Float32Array(pointCount * 3);
  const normals = new Float32Array(pointCount * 3);
  const randomOffsets = new Float32Array(pointCount);

  for (let i = 0; i < pointCount; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius * Math.cbrt(Math.random());
    const sinPhi = Math.sin(phi);
    const i3 = i * 3;
    positions[i3] = r * sinPhi * Math.cos(theta);
    positions[i3 + 1] = r * sinPhi * Math.sin(theta);
    positions[i3 + 2] = r * Math.cos(phi);
    randomOffsets[i] = Math.random();
  }

  return { positions, normals, randomOffsets };
}
