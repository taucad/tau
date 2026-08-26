import { booleans, colors, extrusions, primitives, transforms, type geometries } from '@jscad/modeling';

const { circle } = primitives;
const { union, subtract } = booleans;
const { extrudeLinear } = extrusions;
const { translate } = transforms;
const { colorize } = colors;

type Geom2 = geometries.geom2.Geom2;
type Geom3 = geometries.geom3.Geom3;

const named = <T extends object>(shape: T, name: string): T => Object.assign(shape, { name });

export const defaultParams = {
  bodyRadius: 18,
  earRadius: 6,
  earOffset: 21,
  centerHoleRadius: 5,
  boltHoleRadius: 2.2,
  thickness: 6,
  segments: 48,
};

const fourAround = <T>(makeShape: (x: number, y: number) => T): T[] => {
  const shapes: T[] = [];
  for (let index = 0; index < 4; index++) {
    const angle = (index * Math.PI) / 2;
    shapes.push(makeShape(Math.cos(angle), Math.sin(angle)));
  }
  return shapes;
};

const mountingPlateProfile = (p = defaultParams): Geom2 => {
  const body = circle({ radius: p.bodyRadius, segments: p.segments });
  const ears = fourAround((x, y) =>
    translate([x * p.earOffset, y * p.earOffset, 0], circle({ radius: p.earRadius, segments: 24 })),
  );
  const solidProfile = union(body, ...ears);

  const centerHole = circle({ radius: p.centerHoleRadius, segments: 32 });
  const boltHoles = fourAround((x, y) =>
    translate([x * p.earOffset, y * p.earOffset, 0], circle({ radius: p.boltHoleRadius, segments: 18 })),
  );

  return subtract(solidProfile, centerHole, ...boltHoles);
};

export default function main(p = defaultParams): Geom3 {
  const profile = mountingPlateProfile(p);
  const plate = extrudeLinear({ height: p.thickness }, profile);
  return named(colorize([0.2, 0.55, 0.85, 1], plate), 'Mounting Plate');
}
