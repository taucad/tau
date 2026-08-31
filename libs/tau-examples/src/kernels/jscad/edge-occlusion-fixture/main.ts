import type { geometries } from '@jscad/modeling';
import { colors, primitives, transforms } from '@jscad/modeling';

type Geom3 = geometries.geom3.Geom3;

const { colorize } = colors;
const { cuboid } = primitives;
const { translate } = transforms;

export default function main(): Geom3[] {
  const frontSlab = translate(
    [0, -2, 0],
    cuboid({ size: [96, 4, 96], center: [0, 0, 0] }),
  );
  const rearCuboid = translate(
    [0, 6.1, 0],
    cuboid({ size: [24, 12, 24], center: [0, 0, 0] }),
  );

  return [
    colorize([0.18, 0.52, 1, 1], frontSlab),
    colorize([1, 0.12, 0.06, 1], rearCuboid),
  ];
}
