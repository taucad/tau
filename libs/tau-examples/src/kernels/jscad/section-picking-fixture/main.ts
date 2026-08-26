import type { geometries } from '@jscad/modeling';
import { colors, primitives, transforms } from '@jscad/modeling';

type Geom3 = geometries.geom3.Geom3;

const { colorize } = colors;
const { cuboid } = primitives;
const { translate } = transforms;

export default function main(): Geom3[] {
  const visibleLeftBlock = translate(
    [-24, 0, 0],
    cuboid({ size: [14, 14, 14], center: [0, 0, 0] }),
  );
  const clippedRightBlock = translate(
    [24, 0, 0],
    cuboid({ size: [14, 14, 14], center: [0, 0, 0] }),
  );

  return [
    colorize([0.22, 0.72, 0.36, 1], visibleLeftBlock),
    colorize([0.15, 0.36, 0.95, 1], clippedRightBlock),
  ];
}
