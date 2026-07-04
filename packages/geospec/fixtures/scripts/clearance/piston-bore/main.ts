import { makeBaseBox, makeCylinder } from 'replicad';
import { axis } from 'replicad/annotations';

// Audit row `clearance.piston-bore-skirt-positive`: bore r47.000, skirt
// r46.970 (side clearance 0.030 in [0.015, 0.060]), insertion depth 30.
export const defaultParams = {
  skirtRadius: 46.97, // Mm
};

export default function main(p = defaultParams) {
  // Cylinder block z ∈ [0, 40] with a single through-bore r47 along Z.
  const block = makeBaseBox(110, 110, 40).cut(makeCylinder(47, 40));

  // Piston skirt z ∈ [10, 60]: inserted over z ∈ [10, 40] — skirt engagement 30.
  const piston = makeCylinder(p.skirtRadius, 50, [0, 0, 10]);

  return [
    { shape: block, name: 'block', interfaces: { bore: axis((f) => f.ofSurfaceType('CYLINDRE')) } },
    { shape: piston, name: 'piston', interfaces: { skirt: axis((f) => f.ofSurfaceType('CYLINDRE')) } },
  ];
}
