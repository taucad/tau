import { makeBaseBox, makeCylinder } from 'replicad';
import { axis, face } from '@taucad/replicad/annotations';

// Serves two audit rows over one geometry: `contact.plug-seat-positive`
// (annular washer-to-seat contact plus coaxial prerequisite) and
// `containment.spark-plug-thread-positive` (threaded reach 16.0 into the
// bore, inside the audit's [14.5, 19.0] band).
export const defaultParams = {};

export default function main(_p = defaultParams) {
  // Head block z ∈ [0, 30]: plug bore r6 up to the seat, counterbore r11
  // from the top face down to the annular seat plane at z = 24.
  const head = makeBaseBox(40, 40, 30)
    .cut(makeCylinder(6, 30))
    .cut(makeCylinder(11, 6, [0, 0, 24]));

  // Plug: threaded region r5.95 spanning z ∈ [8, 24] (reach 16 below the
  // seat), washer disk r10.9 seated on the counterbore seat, body above.
  const plug = makeCylinder(5.95, 16, [0, 0, 8])
    .fuse(makeCylinder(10.9, 3, [0, 0, 24]))
    .fuse(makeCylinder(4, 13, [0, 0, 27]));

  return [
    {
      shape: head,
      name: 'head',
      interfaces: {
        plugBore: axis((f) => f.ofSurfaceType('CYLINDRE').containsPoint([6, 0, 12])),
        seat: face((f) => f.inPlane('XY', 24)),
      },
    },
    {
      shape: plug,
      name: 'plug',
      interfaces: {
        thread: axis((f) => f.ofSurfaceType('CYLINDRE').containsPoint([5.95, 0, 16])),
        washerSeat: face((f) => f.inPlane('XY', 24)),
      },
    },
  ];
}
