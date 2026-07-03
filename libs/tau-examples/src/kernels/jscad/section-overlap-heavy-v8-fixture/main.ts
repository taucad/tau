import type { geometries } from '@jscad/modeling';
import { colors, primitives, transforms } from '@jscad/modeling';

type Geom3 = geometries.geom3.Geom3;

const { colorize } = colors;
const { cuboid, cylinder } = primitives;
const { rotateX, rotateY, rotateZ, translate } = transforms;

const cylinderAlongX = (
  x: number,
  y: number,
  z: number,
  radius: number,
  length: number,
): Geom3 =>
  translate(
    [x, y, z],
    rotateY(
      Math.PI / 2,
      cylinder({ radius, height: length, segments: 48, center: [0, 0, 0] }),
    ),
  );

const angledRod = (x: number, y: number, z: number, angle: number): Geom3 =>
  translate(
    [x, y, z],
    rotateZ(angle, cuboid({ size: [7, 42, 18], center: [0, 0, 0] })),
  );

export default function main(): Geom3[] {
  const block = translate(
    [0, 0, 0],
    cuboid({ size: [128, 36, 34], center: [0, 0, 0] }),
  );
  const upperDeck = translate(
    [0, 8, 22],
    cuboid({ size: [122, 26, 18], center: [0, 0, 0] }),
  );
  const crankshaft = cylinderAlongX(0, -5, -7, 9, 144);
  const camshaft = cylinderAlongX(0, 10, 22, 5, 120);
  const cylinderOffsets = [-49, -35, -21, -7, 7, 21, 35, 49];
  const pistons = cylinderOffsets.map((x, index) =>
    translate(
      [x, index % 2 === 0 ? -8 : 8, 4],
      rotateX(
        Math.PI / 2,
        cylinder({
          radius: 8,
          height: 24,
          segments: 36,
          center: [0, 0, 0],
        }),
      ),
    ),
  );
  const rods = cylinderOffsets.map((x, index) =>
    angledRod(x, index % 2 === 0 ? -4 : 4, -4, index % 2 === 0 ? 0.25 : -0.25),
  );
  const valveCovers = [
    translate([-28, 18, 34], cuboid({ size: [58, 16, 10], center: [0, 0, 0] })),
    translate([28, 18, 34], cuboid({ size: [58, 16, 10], center: [0, 0, 0] })),
  ];
  const timingCover = translate(
    [68, 0, 0],
    cuboid({ size: [12, 44, 44], center: [0, 0, 0] }),
  );
  const sump = translate(
    [0, -16, -24],
    cuboid({ size: [112, 18, 10], center: [0, 0, 0] }),
  );

  return [
    colorize([0.58, 0.62, 0.66, 1], block),
    colorize([0.42, 0.45, 0.5, 1], upperDeck),
    colorize([0.34, 0.34, 0.36, 1], crankshaft),
    colorize([0.48, 0.18, 0.12, 1], camshaft),
    ...pistons.map((shape) => colorize([0.78, 0.78, 0.8, 1], shape)),
    ...rods.map((shape, index) =>
      colorize(
        index % 2 === 0 ? [0.3, 0.48, 0.78, 1] : [0.24, 0.42, 0.68, 1],
        shape,
      ),
    ),
    ...valveCovers.map((shape) => colorize([0.12, 0.12, 0.14, 1], shape)),
    colorize([0.66, 0.68, 0.7, 1], timingCover),
    colorize([0.08, 0.08, 0.1, 1], sump),
  ];
}
