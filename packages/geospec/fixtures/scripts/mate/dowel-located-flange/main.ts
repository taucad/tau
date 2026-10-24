import { makeBaseBox, makeCylinder } from 'replicad';
import { axis, datum, face, group } from '@taucad/replicad/annotations';

const DOWELS: Array<[number, number]> = [
  [-25, 0],
  [25, 0],
];
const BOLTS: Array<[number, number]> = [
  [-30, -20],
  [30, -20],
  [-30, 20],
  [30, 20],
];

export const defaultParams = {
  rotateDegrees: 0, // Degrees - cover rotation about the deck normal (Z) through the deck center
  inPlaneOffset: 0, // Mm - cover translation along +X
};

export default function main(p = defaultParams) {
  // Base plate z ∈ [0, 10]: two dowel pins proud of the deck (z = 10), four bolt holes through.
  let base = makeBaseBox(80, 60, 10);
  for (const [x, y] of DOWELS) {
    base = base.fuse(makeCylinder(3, 8, [x, y, 10]));
  }
  for (const [x, y] of BOLTS) {
    base = base.cut(makeCylinder(4.2, 10, [x, y, 0]));
  }

  // Cover plate z ∈ [10, 20]: matching dowel bores and bolt holes, then the variant displacement.
  let cover = makeBaseBox(80, 60, 10).translate([0, 0, 10]);
  for (const [x, y] of DOWELS) {
    cover = cover.cut(makeCylinder(3.03, 8.5, [x, y, 10]));
  }
  for (const [x, y] of BOLTS) {
    cover = cover.cut(makeCylinder(4.2, 10, [x, y, 10]));
  }
  cover = cover.translate([p.inPlaneOffset, 0, 0]).rotate(p.rotateDegrees, [0, 0, 10], [0, 0, 1]);

  // Probe points live in the part's placed frame — displace them exactly like the cover.
  const moved = ([x, y]: [number, number], z: number): [number, number, number] => {
    const radians = (p.rotateDegrees * Math.PI) / 180;
    const offsetX = x + p.inPlaneOffset;
    return [
      offsetX * Math.cos(radians) - y * Math.sin(radians),
      offsetX * Math.sin(radians) + y * Math.cos(radians),
      z,
    ];
  };

  return [
    {
      shape: base,
      name: 'base',
      interfaces: {
        origin: datum({ origin: [0, 0, 0], zAxis: [0, 0, 1], xAxis: [1, 0, 0] }),
        deck: face((f) => f.inPlane('XY', 10)),
        dowel: group(DOWELS.map(([x, y]) => axis((f) => f.ofSurfaceType('CYLINDRE').containsPoint([x + 3, y, 14])))),
        boltHole: group(BOLTS.map(([x, y]) => axis((f) => f.ofSurfaceType('CYLINDRE').containsPoint([x + 4.2, y, 5])))),
      },
    },
    {
      shape: cover,
      name: 'cover',
      interfaces: {
        deck: face((f) => f.containsPoint(moved([0, 0], 10))),
        dowelBore: group(
          DOWELS.map(([x, y]) => axis((f) => f.ofSurfaceType('CYLINDRE').containsPoint(moved([x + 3.03, y], 14)))),
        ),
        boltHole: group(
          BOLTS.map(([x, y]) => axis((f) => f.ofSurfaceType('CYLINDRE').containsPoint(moved([x + 4.2, y], 15)))),
        ),
      },
    },
  ];
}
