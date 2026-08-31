import type { geometries as JscadGeometries } from '@jscad/modeling';
import { colors, geometries, primitives } from '@jscad/modeling';

type Geom3 = JscadGeometries.geom3.Geom3;

const { colorize } = colors;
const { geom3 } = geometries;
const { cuboid } = primitives;

export default function main(): Geom3 {
  const closedCube = cuboid({ size: [4, 4, 4], center: [0, 0, 0] });
  return colorize(
    [0.62, 0.55, 0.46, 1],
    geom3.create(geom3.toPolygons(closedCube).slice(1)),
  );
}
