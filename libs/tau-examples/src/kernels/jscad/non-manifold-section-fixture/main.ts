import type { geometries as JscadGeometries } from '@jscad/modeling';
import { colors, geometries, primitives, transforms } from '@jscad/modeling';

type Geom3 = JscadGeometries.geom3.Geom3;

const { colorize } = colors;
const { geom3 } = geometries;
const { cuboid } = primitives;
const { translate } = transforms;

function mergePolygonsWithoutBooleanUnion(shapes: readonly Geom3[]): Geom3 {
  return geom3.create(shapes.flatMap((shape) => geom3.toPolygons(shape)));
}

export default function main(): Geom3 {
  const leftBlock = translate(
    [-1, 0, 0],
    cuboid({ size: [2, 2, 2], center: [0, 0, 0] }),
  );
  const rightBlock = translate(
    [1, 0, 0],
    cuboid({ size: [2, 2, 2], center: [0, 0, 0] }),
  );

  return colorize(
    [0.62, 0.55, 0.46, 1],
    mergePolygonsWithoutBooleanUnion([leftBlock, rightBlock]),
  );
}
