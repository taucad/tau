import type { geometries } from '@jscad/modeling';
import { booleans, colors, primitives, transforms } from '@jscad/modeling';

type Geom3 = geometries.geom3.Geom3;

const { union } = booleans;
const { colorize } = colors;
const { cuboid, cylinder, torus } = primitives;
const { translate } = transforms;

export default function main(): Geom3[] {
  const housing = torus({
    innerRadius: 6,
    outerRadius: 26,
    innerSegments: 32,
    outerSegments: 96,
  });

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
