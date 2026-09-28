import { makeCylinder, type Shape3D } from 'replicad';

export const defaultParams = { outerRadius: 7.6, innerRadius: 6.2, length: 3 };
export function buildLensRetainer(p = defaultParams): Shape3D {
  if (
    p.innerRadius <= 0 ||
    p.outerRadius - p.innerRadius < 1.2 ||
    p.length < 2
  ) {
    throw new Error(
      'Lens retainer needs >=1.2 mm radial wall and >=2 mm length.',
    );
  }
  return makeCylinder(p.outerRadius, p.length, [0, 0, 0], [1, 0, 0]).cut(
    makeCylinder(p.innerRadius, p.length + 2, [-1, 0, 0], [1, 0, 0]),
  );
}
export default function main(p = defaultParams) {
  return buildLensRetainer(p);
}
