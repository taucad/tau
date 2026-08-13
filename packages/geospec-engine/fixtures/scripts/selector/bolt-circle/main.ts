import { makeBaseBox, makeCylinder } from 'replicad';
import { axis, group } from '@taucad/runtime/kernels/replicad/annotations';

export const defaultParams = {
  holeCount: 8, // 7 = drift variant (skips the last station; never redistributes)
};

export default function main(p = defaultParams) {
  const stations = Array.from({ length: p.holeCount }, (_, index) => {
    const angle = (index * 2 * Math.PI) / 8; // Always /8 so the drift variant leaves a hole missing.
    return [30 * Math.cos(angle), 30 * Math.sin(angle)] as const;
  });

  let flange = makeBaseBox(90, 90, 8);
  for (const [x, y] of stations) {
    flange = flange.cut(makeCylinder(4.2, 8, [x, y, 0]));
  }

  return [
    {
      shape: flange,
      name: 'flange',
      interfaces: {
        boltHole: group(
          stations.map(([x, y]) => axis((f) => f.ofSurfaceType('CYLINDRE').containsPoint([x + 4.2, y, 4]))),
        ),
      },
    },
  ];
}
