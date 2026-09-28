import { drawRoundedRectangle, makeCylinder, type Shape3D } from 'replicad';

export const defaultParams = { screwRadius: 1.1 };
export function buildFixedMount(p = defaultParams): Shape3D {
  if (p.screwRadius < 1 || p.screwRadius > 1.25) {
    throw new Error('Mount clearance radius must be 1..1.25 mm.');
  }
  // Keep the screw bores clear of the rim fillet's tangent boundary.
  const plate = drawRoundedRectangle(9, 20, 3)
    .sketchOnPlane('XY', [26, 0, -8])
    .extrude(3)
    .fillet(1);
  return plate.cutAll([
    makeCylinder(1.6, 5, [24, 0, -9]),
    ...[-7, 7].map((y) => makeCylinder(p.screwRadius, 5, [28.2, y, -9])),
  ]);
}
export default function main(p = defaultParams) {
  return buildFixedMount(p);
}
