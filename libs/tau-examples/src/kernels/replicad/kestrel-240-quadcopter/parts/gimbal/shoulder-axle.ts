import { makeCylinder, type Shape3D } from 'replicad';

// Turned stainless axle. Final retention/fit must be resolved against selected bearing.
export const defaultParams = { radius: 1.45, length: 8.1 };
export function buildShoulderAxle(p = defaultParams): Shape3D {
  if (p.radius <= 0 || p.radius >= 2.1 || p.length <= 0) {
    throw new Error('Invalid shoulder axle dimensions.');
  }
  return makeCylinder(p.radius, p.length).fuse(
    makeCylinder(2.1, 0.8, [0, 0, -0.8]),
  );
}
export default function main(p = defaultParams) {
  return buildShoulderAxle(p);
}
