import type { geometries } from '@jscad/modeling';
import { booleans, colors, primitives } from '@jscad/modeling';

type Geom3 = geometries.geom3.Geom3;

const { subtract } = booleans;
const { colorize } = colors;
const { cuboid, cylinder } = primitives;

export const defaultParams = {
  cubeSize: 50,
  cylinderRadius: 10,
  cylinderHeight: 60,
};

export default function main(p = defaultParams): Geom3 {
  const cube = cuboid({
    size: [p.cubeSize, p.cubeSize, p.cubeSize],
    center: [0, 0, p.cubeSize / 2],
  });

  const cutter = cylinder({
    radius: p.cylinderRadius,
    height: p.cylinderHeight,
    center: [0, 0, p.cubeSize / 2],
    segments: 64,
  });

  return colorize([0.72, 0.72, 0.7, 1], subtract(cube, cutter));
}
