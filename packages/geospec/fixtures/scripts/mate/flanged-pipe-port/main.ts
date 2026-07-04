import { makeBaseBox, makeCylinder } from 'replicad';
import { axis, face, group } from 'replicad/annotations';

const BOLTS: Array<[number, number]> = [
  [-22, -22],
  [22, -22],
  [-22, 22],
  [22, 22],
];

// Audit rows `mate.flanged-pipe-port-positive` and `mate.aabb-pass-real-fail`:
// flange faces contact and bolt holes align in both variants; the adversarial
// variant offsets the flange's port opening laterally by 8.00 so AABBs (and
// even face contact) pass while the port-alignment subconstraint fails.
export const defaultParams = {
  portOffset: 0, // Mm - flange port-opening offset along +X
};

export default function main(p = defaultParams) {
  // Manifold block z ∈ [0, 10]: port bore r10 at the origin, four bolt holes.
  let manifold = makeBaseBox(60, 60, 10).cut(makeCylinder(10, 10));
  for (const [x, y] of BOLTS) {
    manifold = manifold.cut(makeCylinder(4.2, 10, [x, y, 0]));
  }

  // Flange plate z ∈ [10, 20]: port opening at (portOffset, 0), matching bolt holes.
  let flange = makeBaseBox(60, 60, 10)
    .translate([0, 0, 10])
    .cut(makeCylinder(10, 10, [p.portOffset, 0, 10]));
  for (const [x, y] of BOLTS) {
    flange = flange.cut(makeCylinder(4.2, 10, [x, y, 10]));
  }

  return [
    {
      shape: manifold,
      name: 'manifold',
      interfaces: {
        face: face((f) => f.inPlane('XY', 10)),
        port: axis((f) => f.ofSurfaceType('CYLINDRE').containsPoint([10, 0, 5])),
        boltHole: group(BOLTS.map(([x, y]) => axis((f) => f.ofSurfaceType('CYLINDRE').containsPoint([x + 4.2, y, 5])))),
      },
    },
    {
      shape: flange,
      name: 'runnerFlange',
      interfaces: {
        face: face((f) => f.inPlane('XY', 10)),
        port: axis((f) => f.ofSurfaceType('CYLINDRE').containsPoint([p.portOffset + 10, 0, 15])),
        boltHole: group(
          BOLTS.map(([x, y]) => axis((f) => f.ofSurfaceType('CYLINDRE').containsPoint([x + 4.2, y, 15]))),
        ),
      },
    },
  ];
}
