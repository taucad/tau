/* oxlint-disable eslint/new-cap -- smlibwasm's shape constructors are functions (Box, Pos), as in build123d. */
import { Align, Box, Cylinder, Pos, Rot, Sphere, Z } from '@classcad/smlibwasm';
import type { Part } from '@classcad/smlibwasm';
import type { Material, Model } from '@taucad/smlib/model';
import type { MechanismSource } from '@taucad/kinematics';

export const defaultParams = {
  length: 90,
  width: 60,
  height: 36,
  wall: 2.5,
  lidThickness: 5,
  hingeRadius: 3,
  maxOpening: 110,
};

export const partNames = {
  body: 'Box body',
  leftKnuckle: 'Left body knuckle',
  rightKnuckle: 'Right body knuckle',
  pin: 'Hinge pin',
  lid: 'Lid',
  lidKnuckle: 'Lid knuckle',
  knob: 'Lid knob',
} as const;
type ShapeName = (typeof partNames)[keyof typeof partNames];

const walnut: Material = {
  pbrMetallicRoughness: {
    baseColorFactor: [0.23, 0.11, 0.05, 1],
    metallicFactor: 0,
    roughnessFactor: 0.55,
  },
  extensions: {
    KHR_materials_clearcoat: {
      clearcoatFactor: 0.6,
      clearcoatRoughnessFactor: 0.2,
    },
  },
};
const brass: Material = {
  pbrMetallicRoughness: {
    baseColorFactor: [0.9, 0.68, 0.3, 1],
    metallicFactor: 1,
    roughnessFactor: 0.25,
  },
};
const steel: Material = {
  pbrMetallicRoughness: {
    baseColorFactor: [0.7, 0.72, 0.75, 1],
    metallicFactor: 1,
    roughnessFactor: 0.3,
  },
};

const validate = (p: typeof defaultParams): void => {
  const positive = [
    p.length,
    p.width,
    p.height,
    p.wall,
    p.lidThickness,
    p.hingeRadius,
  ];
  if (!positive.every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError(
      'Box dimensions, wall and hinge radius must be positive.',
    );
  }
  if (p.wall * 4 >= Math.min(p.length, p.width, p.height)) {
    throw new RangeError(
      'wall must be under a quarter of the smallest box side.',
    );
  }
  if (p.length < 40 || p.hingeRadius * 2 > p.height) {
    throw new RangeError('Use length >= 40 mm and hingeRadius <= height / 2.');
  }
  if (
    !Number.isFinite(p.maxOpening) ||
    p.maxOpening <= 0 ||
    p.maxOpening > 180
  ) {
    throw new RangeError('maxOpening must be in (0, 180] degrees.');
  }
};

/** The hinge line: along X behind the back wall, level with the top of the body. */
const hingeAxis = (p: typeof defaultParams): [number, number, number] => [
  0,
  p.width / 2 + p.hingeRadius,
  p.height,
];

/** A cylinder along X from `x0` to `x1` on the hinge line. */
const knuckle = (
  p: typeof defaultParams,
  x0: number,
  x1: number,
  radius: number,
): Part => {
  const [, y, z] = hingeAxis(p);
  const barrel = Rot(0, 90, 0).mul(
    Cylinder(radius, x1 - x0, { align: Align.CENTER }),
  );
  return Pos((x0 + x1) / 2, y, z).mul(barrel);
};

/**
 * A walnut box with a lid on a three-knuckle brass hinge. The lid is modelled closed; the
 * mechanism opens it about the hinge pin.
 */
export default function main(p = defaultParams): Model {
  validate(p);
  const standing = [Align.CENTER, Align.CENTER, Align.MIN];
  let body = Box(p.length, p.width, p.height, { align: standing });
  body = body.fillet(body.edges().parallelTo(Z), p.wall * 1.5);
  body = body.shell(p.wall, body.faces().maxBy(Z));

  let lid = Pos(0, 0, p.height).mul(
    Box(p.length, p.width, p.lidThickness, { align: standing }),
  );
  lid = lid.fillet(lid.edges().parallelTo(Z), p.wall * 1.5);
  lid = lid.fillet(lid.edges().maxBy(Z), Math.min(1.5, p.lidThickness / 3));

  const half = p.length / 2;
  const third = p.length / 6;
  const gap = 0.5;
  const pinRadius = p.hingeRadius / 2.5;
  const knob = Pos(0, -p.width / 2 + 10, p.height + p.lidThickness).mul(
    Sphere(4, { align: Align.CENTER }),
  );

  return {
    shapes: [
      { name: partNames.body, shape: body, material: walnut },
      {
        name: partNames.leftKnuckle,
        shape: knuckle(p, -half + 6, -third - gap, p.hingeRadius).cut(
          knuckle(p, -half, half, pinRadius),
        ),
        material: brass,
      },
      {
        name: partNames.rightKnuckle,
        shape: knuckle(p, third + gap, half - 6, p.hingeRadius).cut(
          knuckle(p, -half, half, pinRadius),
        ),
        material: brass,
      },
      {
        name: partNames.pin,
        shape: knuckle(p, -half + 5, half - 5, pinRadius),
        material: steel,
      },
      { name: partNames.lid, shape: lid, material: walnut },
      {
        name: partNames.lidKnuckle,
        shape: knuckle(p, -third, third, p.hingeRadius).cut(
          knuckle(p, -half, half, pinRadius),
        ),
        material: brass,
      },
      { name: partNames.knob, shape: knob, material: brass },
    ],
  };
}

export function mechanism(p = defaultParams) {
  validate(p);
  return {
    schemaVersion: 1,
    units: { length: 'mm', angle: 'deg' },
    root: 'body',
    links: {
      body: {
        shapes: [
          partNames.body,
          partNames.leftKnuckle,
          partNames.rightKnuckle,
          partNames.pin,
        ],
      },
      lid: { shapes: [partNames.lid, partNames.lidKnuckle, partNames.knob] },
    },
    joints: {
      hinge: {
        type: 'revolute',
        name: 'Lid hinge',
        parent: 'body',
        child: 'lid',
        origin: hingeAxis(p),
        // Positive angles lift the front of the lid.
        axis: [-1, 0, 0],
        limits: { lower: 0, upper: p.maxOpening },
      },
    },
    animations: [
      {
        id: 'open-close',
        name: 'Open and close',
        duration: 4,
        loop: 'repeat',
        keyframes: [
          { time: 0, coordinates: { hinge: 0 } },
          { time: 1.5, coordinates: { hinge: p.maxOpening } },
          { time: 2.5, coordinates: { hinge: p.maxOpening } },
          { time: 4, coordinates: { hinge: 0 } },
        ],
      },
    ],
  } satisfies MechanismSource<ShapeName>;
}
