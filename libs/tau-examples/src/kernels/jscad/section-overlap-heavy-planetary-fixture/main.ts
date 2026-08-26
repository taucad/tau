import type { geometries } from '@jscad/modeling';
import { colors, primitives, transforms } from '@jscad/modeling';

type Geom3 = geometries.geom3.Geom3;

const { colorize } = colors;
const { cuboid, cylinder } = primitives;
const { rotateZ, translate } = transforms;

const tooth = (
  angle: number,
  radius: number,
  length: number,
  width: number,
  height: number,
): Geom3 =>
  rotateZ(
    angle,
    translate(
      [radius, 0, 0],
      cuboid({ size: [length, width, height], center: [0, 0, 0] }),
    ),
  );

const gearTeeth = (
  count: number,
  radius: number,
  length: number,
  width: number,
  height: number,
): Geom3[] =>
  Array.from({ length: count }, (_, index) =>
    tooth((Math.PI * 2 * index) / count, radius, length, width, height),
  );

export default function main(): Geom3[] {
  const ringCarrier = cylinder({
    radius: 54,
    height: 14,
    segments: 96,
    center: [0, 0, 0],
  });
  const ringTeeth = gearTeeth(42, 46, 14, 4.6, 18);
  const sun = cylinder({
    radius: 14,
    height: 20,
    segments: 48,
    center: [0, 0, 0],
  });
  const sunTeeth = gearTeeth(16, 16, 8, 4.2, 24);
  const planetCenters = [
    [26, 0],
    [0, 26],
    [-26, 0],
    [0, -26],
  ] as const;
  const planets = planetCenters.flatMap(([x, y], planetIndex) => {
    const body = translate(
      [x, y, 0],
      cylinder({ radius: 12, height: 22, segments: 40, center: [0, 0, 0] }),
    );
    const teeth = gearTeeth(14, 12.5, 7.2, 3.8, 24).map((shape) =>
      translate([x, y, 0], rotateZ(planetIndex * 0.2, shape)),
    );
    return [body, ...teeth];
  });
  const overlapBars = planetCenters.map(([x, y], index) =>
    rotateZ(
      index * (Math.PI / 2),
      translate(
        [x * 0.52, y * 0.52, 0],
        cuboid({ size: [32, 8, 24], center: [0, 0, 0] }),
      ),
    ),
  );

  return [
    colorize([0.48, 0.62, 0.76, 1], ringCarrier),
    ...ringTeeth.map((shape) => colorize([0.36, 0.42, 0.52, 1], shape)),
    colorize([0.96, 0.72, 0.24, 1], sun),
    ...sunTeeth.map((shape) => colorize([0.88, 0.56, 0.16, 1], shape)),
    ...planets.map((shape, index) =>
      colorize(
        index % 2 === 0 ? [0.08, 0.58, 0.86, 1] : [0.12, 0.48, 0.78, 1],
        shape,
      ),
    ),
    ...overlapBars.map((shape) => colorize([0.16, 0.78, 0.4, 1], shape)),
  ];
}
