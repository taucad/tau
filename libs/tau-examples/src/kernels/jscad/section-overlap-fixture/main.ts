import type { geometries } from '@jscad/modeling';
import { colors, primitives, transforms } from '@jscad/modeling';

type Geom3 = geometries.geom3.Geom3;

const { colorize } = colors;
const { cuboid } = primitives;
const { translate } = transforms;

export default function main(): Geom3[] {
  const leftBlock = translate(
    [25, 0, 0],
    cuboid({ size: [26, 20, 20], center: [0, 0, 0] }),
  );
  const rightBlock = translate(
    [35, 0, 0],
    cuboid({ size: [26, 20, 20], center: [0, 0, 0] }),
  );
  const tangentBlock = translate(
    [58, 0, 0],
    cuboid({ size: [20, 20, 20], center: [0, 0, 0] }),
  );
  const largeAssemblyBlock = translate(
    [112, 0, 0],
    cuboid({ size: [76, 24, 20], center: [0, 0, 0] }),
  );
  const crankshaftLikeOverlapBars = [-24, -12, 0, 12, 24].map((offset) =>
    translate(
      [112 + offset, 0, 0],
      cuboid({ size: [7, 32, 20], center: [0, 0, 0] }),
    ),
  );
  const genuineRedSource = translate(
    [160, 0, 0],
    cuboid({ size: [10, 20, 20], center: [0, 0, 0] }),
  );

  return [
    colorize([0.25, 0.56, 1, 1], leftBlock),
    colorize([0.18, 0.78, 0.36, 1], rightBlock),
    colorize([0.95, 0.72, 0.24, 1], tangentBlock),
    colorize([0.58, 0.58, 0.58, 1], largeAssemblyBlock),
    ...crankshaftLikeOverlapBars.map((bar, index) =>
      colorize(
        [index % 2 === 0 ? 0.26 : 0.34, 0.48, index % 2 === 0 ? 0.86 : 0.74, 1],
        bar,
      ),
    ),
    colorize([0.92, 0.16, 0.14, 1], genuineRedSource),
  ];
}
