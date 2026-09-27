import { draw, makeCylinder, type Shape3D } from 'replicad';

export const defaultParams = { radius: 15.5, wall: 1.8 };
export function buildCameraFront(p = defaultParams): Shape3D {
  if (p.radius < 15.5 || p.wall < 1.8 || p.wall > 3) {
    throw new Error('Camera radius must be >=15.5 and wall 1.8..3 mm.');
  }
  const r = p.radius,
    inner = r - p.wall,
    port = 7.8,
    seam = -0.15;
  // Revolved exact circle arcs avoid the degenerate pole of a trimmed sphere boolean.
  const shell = draw([seam, Math.sqrt(r * r - seam * seam)])
    .threePointsArcTo(
      [-Math.sqrt(r * r - port * port), port],
      [-r * Math.SQRT1_2, r * Math.SQRT1_2],
    )
    .lineTo([-Math.sqrt(inner * inner - port * port), port])
    .threePointsArcTo(
      [seam, Math.sqrt(inner * inner - seam * seam)],
      [-inner * Math.SQRT1_2, inner * Math.SQRT1_2],
    )
    .close()
    .sketchOnPlane('XY')
    .revolve([1, 0, 0]);
  return shell
    .fuseAll(
      [-10.5, 10.5].map((z) => makeCylinder(3.6, 3.85, [-4, 0, z], [1, 0, 0])),
    )
    .cutAll(
      [-10.5, 10.5].map((z) => makeCylinder(1.1, 12, [-6, 0, z], [1, 0, 0])),
    );
}
export default function main(p = defaultParams) {
  return buildCameraFront(p);
}
