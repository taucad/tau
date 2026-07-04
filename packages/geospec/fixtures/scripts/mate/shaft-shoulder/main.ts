import { makeCylinder } from 'replicad';
import { axis, face } from 'replicad/annotations';

// Audit rows `mate.shaft-shoulder-bearing-positive` and
// `mate.shaft-shoulder-stand-off-negative`: pulley bore coaxial on the
// journal; pulley back face seats on the shoulder plane (stand-off 1.00
// leaves coaxiality passing while axial seating fails).
export const defaultParams = {
  standOff: 0, // Mm - pulley translation along +Z away from the shoulder
};

export default function main(p = defaultParams) {
  // Shaft along Z: big section r15 z ∈ [0, 20], journal r10 z ∈ [20, 50];
  // the shoulder is the annular plane z = 20 (r10..r15).
  const shaft = makeCylinder(15, 20).fuse(makeCylinder(10, 30, [0, 0, 20]));

  // Pulley disk r30, thickness 10, bore r10.03; back face at z = 20 + standOff.
  const pulley = makeCylinder(30, 10, [0, 0, 20 + p.standOff]).cut(makeCylinder(10.03, 10, [0, 0, 20 + p.standOff]));

  return [
    {
      shape: shaft,
      name: 'shaft',
      interfaces: {
        journal: axis((f) => f.ofSurfaceType('CYLINDRE').containsPoint([10, 0, 35])),
        shoulder: face((f) => f.inPlane('XY', 20)),
      },
    },
    {
      shape: pulley,
      name: 'pulley',
      interfaces: {
        bore: axis((f) => f.ofSurfaceType('CYLINDRE').containsPoint([10.03, 0, 25 + p.standOff])),
        back: face((f) => f.inPlane('XY', 20 + p.standOff)),
      },
    },
  ];
}
