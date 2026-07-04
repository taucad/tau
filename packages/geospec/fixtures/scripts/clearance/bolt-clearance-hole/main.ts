import { makeBaseBox, makeCylinder } from 'replicad';
import { axis } from 'replicad/annotations';

// Audit row `clearance.bolt-clearance-hole-positive`: shank r4.000 through a
// clearance hole r4.200 (radial clearance 0.200) traversing the full plate
// thickness 8.000, coaxial.
export const defaultParams = {};

export default function main(_p = defaultParams) {
  // Plate z ∈ [0, 8] with one clearance hole r4.2 along Z.
  const plate = makeBaseBox(30, 30, 8).cut(makeCylinder(4.2, 8));

  // Bolt: shank r4 spanning z ∈ [-2, 12] (traverses the plate), head r7 above.
  const bolt = makeCylinder(4, 14, [0, 0, -2]).fuse(makeCylinder(7, 4, [0, 0, 12]));

  return [
    { shape: plate, name: 'plate', interfaces: { hole: axis((f) => f.ofSurfaceType('CYLINDRE')) } },
    {
      shape: bolt,
      name: 'bolt',
      interfaces: { shank: axis((f) => f.ofSurfaceType('CYLINDRE').containsPoint([4, 0, 5])) },
    },
  ];
}
