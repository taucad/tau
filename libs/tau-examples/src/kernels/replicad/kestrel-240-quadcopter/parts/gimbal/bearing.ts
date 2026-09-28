import { makeCylinder, type Shape3D } from 'replicad';

// Purchased 3x8x3 miniature bearing overall envelope, not internal race/ball manufacture.
export const defaultParams = { outerRadius: 4, boreRadius: 1.5, width: 3 };
export function buildBearing(p = defaultParams): Shape3D {
  if (p.boreRadius <= 0 || p.outerRadius <= p.boreRadius || p.width <= 0) {
    throw new Error('Invalid bearing dimensions.');
  }
  return makeCylinder(p.outerRadius, p.width).cut(
    makeCylinder(p.boreRadius, p.width + 2, [0, 0, -1]),
  );
}
export default function main(p = defaultParams) {
  return buildBearing(p);
}
