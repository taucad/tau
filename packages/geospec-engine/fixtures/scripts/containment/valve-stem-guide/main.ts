import { makeBaseBox, makeCylinder } from 'replicad';
import { axis } from '@taucad/replicad/annotations';

// Audit row `containment.valve-stem-guide-positive`: stem r4 through a guide
// bore r4.03 (radial clearance 0.030), insertion length 35.
export const defaultParams = {};

export default function main(_p = defaultParams) {
  // Guide boss z ∈ [0, 45] with a single through-bore r4.03 along Z.
  const guide = makeBaseBox(20, 20, 45).cut(makeCylinder(4.03, 45));

  // Valve stem z ∈ [10, 70]: inside the guide over z ∈ [10, 45] — insertion 35.
  const stem = makeCylinder(4, 60, [0, 0, 10]);

  return [
    { shape: guide, name: 'guide', interfaces: { bore: axis((f) => f.ofSurfaceType('CYLINDRE')) } },
    { shape: stem, name: 'valve', interfaces: { stem: axis((f) => f.ofSurfaceType('CYLINDRE')) } },
  ];
}
