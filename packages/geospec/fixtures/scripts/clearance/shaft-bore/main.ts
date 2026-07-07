import { makeBaseBox, makeCylinder } from 'replicad';
import { axis } from '@taucad/runtime/kernels/replicad/annotations';

export const defaultParams = {
  boreRadius: 25.04, // Mm
  shaftRadius: 25, // Mm
  axisOffset: 0, // Mm - shaft axis offset along +X
  tiltDegrees: 0, // Degrees - shaft tilt about the X axis through the bore mid-plane
};

export default function main(p = defaultParams) {
  // Housing plate z ∈ [0, 30] with a single through-bore along Z at the origin —
  // exactly one cylindrical face per part, so a bare ofSurfaceType finder is unambiguous.
  const housing = makeBaseBox(70, 70, 30).cut(makeCylinder(p.boreRadius, 30));

  let shaft = makeCylinder(p.shaftRadius, 30).translate([p.axisOffset, 0, 0]);
  if (p.tiltDegrees !== 0) {
    shaft = shaft.rotate(p.tiltDegrees, [0, 0, 15], [1, 0, 0]);
  }

  return [
    {
      shape: housing,
      name: 'housing',
      interfaces: { bore: axis((f) => f.ofSurfaceType('CYLINDRE')) },
    },
    {
      shape: shaft,
      name: 'shaft',
      interfaces: { journal: axis((f) => f.ofSurfaceType('CYLINDRE')) },
    },
  ];
}
