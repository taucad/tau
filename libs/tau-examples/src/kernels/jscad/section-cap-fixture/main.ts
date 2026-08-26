import type { geometries } from '@jscad/modeling';
import { booleans, colors, primitives, transforms } from '@jscad/modeling';

type Geom3 = geometries.geom3.Geom3;

const { subtract, union } = booleans;
const { colorize } = colors;
const { cuboid, cylinder } = primitives;
const { translate } = transforms;

export default function main(): Geom3[] {
  const housing = subtract(
    cylinder({ height: 8, radius: 32, center: [0, 0, 0], segments: 96 }),
    cylinder({ height: 10, radius: 20, center: [0, 0, 0], segments: 96 }),
    translate(
      [24, 0, 0],
      cylinder({ height: 10, radius: 3, center: [0, 0, 0], segments: 32 }),
    ),
    translate(
      [-24, 0, 0],
      cylinder({ height: 10, radius: 3, center: [0, 0, 0], segments: 32 }),
    ),
  );

  const yellowCore = cylinder({
    height: 18,
    radius: 12,
    center: [0, 0, 0],
    segments: 64,
  });
  const redPostA = translate(
    [14, 10, 0],
    cylinder({ height: 14, radius: 4, center: [0, 0, 0], segments: 32 }),
  );
  const redPostB = translate(
    [-14, -10, 0],
    cylinder({ height: 14, radius: 4, center: [0, 0, 0], segments: 32 }),
  );
  const greenBridge = cuboid({ size: [36, 4, 10], center: [0, 0, 0] });

  return [
    colorize([0.2, 0.55, 1, 1], housing),
    colorize([1, 0.72, 0.02, 1], yellowCore),
    colorize([1, 0.16, 0.08, 1], union(redPostA, redPostB)),
    colorize([0.1, 0.78, 0.32, 1], greenBridge),
  ];
}
