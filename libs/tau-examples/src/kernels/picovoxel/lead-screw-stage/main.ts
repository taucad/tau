import type { Pico, Vec3 } from 'picovoxel';
import { BaseBox } from 'picovoxel/shapekernel';
import type { Material, PicovoxelModel } from '@taucad/picovoxel';
import type { MechanismSource } from '@taucad/kinematics';

export const defaultParams = {
  voxelSize: 0.75,
  carriagePosition: 10,
  lead: 4,
  travel: 30,
};
export const partNames = {
  base: 'Base plate',
  nearRail: 'Near guide rail',
  farRail: 'Far guide rail',
  frontBearing: 'Front bearing block',
  rearBearing: 'Rear bearing block',
  spindle: 'Lead screw',
  wheel: 'Handwheel',
  handle: 'Handwheel handle',
  carriage: 'Carriage',
  nut: 'Bronze drive nut',
} as const;
type ShapeName = (typeof partNames)[keyof typeof partNames];

const steel: Material = {
  pbrMetallicRoughness: {
    baseColorFactor: [0.55, 0.6, 0.65, 1],
    metallicFactor: 1,
    roughnessFactor: 0.3,
  },
};
const blue: Material = {
  pbrMetallicRoughness: {
    baseColorFactor: [0.04, 0.15, 0.35, 1],
    metallicFactor: 0.65,
    roughnessFactor: 0.4,
  },
};
const bronze: Material = {
  pbrMetallicRoughness: {
    baseColorFactor: [0.6, 0.3, 0.1, 1],
    metallicFactor: 1,
    roughnessFactor: 0.35,
  },
};

const validate = (p: typeof defaultParams): void => {
  if (
    ![p.voxelSize, p.lead, p.travel].every(
      (value) => Number.isFinite(value) && value > 0,
    ) ||
    p.travel > 40 ||
    !Number.isFinite(p.carriagePosition) ||
    p.carriagePosition < 0 ||
    p.carriagePosition > p.travel
  ) {
    throw new Error(
      'Use positive voxelSize/lead, travel in (0, 40] mm and carriagePosition in [0, travel].',
    );
  }
};

export default function main(pico: Pico, p = defaultParams): PicovoxelModel {
  validate(p);
  const box = (min: Vec3, max: Vec3) =>
    BaseBox.fromBounds({ min, max }).voxConstruct(pico);
  const beam = (start: Vec3, end: Vec3, radius: number) =>
    pico.createVoxels({ shape: 'beam', start, end, radius });
  const x = 20 + p.carriagePosition;
  const nearBore = beam([x - 4, -12, 13], [x + 18, -12, 13], 2.75);
  const farBore = beam([x - 4, 12, 13], [x + 18, 12, 13], 2.75);
  const screwBore = beam([x - 4, 0, 13], [x + 18, 0, 13], 3);
  const carriage = box([x, -17, 7], [x + 14, 17, 22]).subtract(
    nearBore,
    farBore,
    screwBore,
  );
  const nut = beam([x + 4, 0, 13], [x + 10, 0, 13], 4.5).subtract(screwBore);
  nearBore.dispose();
  farBore.dispose();
  screwBore.dispose();
  return {
    shapes: [
      {
        name: partNames.base,
        shape: box([0, -20, 0], [90, 20, 5]),
        material: blue,
      },
      {
        name: partNames.nearRail,
        shape: beam([8, -12, 13], [82, -12, 13], 2),
        material: steel,
      },
      {
        name: partNames.farRail,
        shape: beam([8, 12, 13], [82, 12, 13], 2),
        material: steel,
      },
      {
        name: partNames.frontBearing,
        shape: box([2, -18, 5], [8, 18, 19]),
        material: blue,
      },
      {
        name: partNames.rearBearing,
        shape: box([82, -18, 5], [88, 18, 19]),
        material: blue,
      },
      {
        name: partNames.spindle,
        shape: beam([-14, 0, 13], [88, 0, 13], 2),
        material: steel,
      },
      {
        name: partNames.wheel,
        shape: beam([-12, 0, 13], [-9, 0, 13], 9),
        material: steel,
      },
      {
        name: partNames.handle,
        shape: beam([-11, 6, 13], [-11, 6, 23], 2),
        material: blue,
      },
      { name: partNames.carriage, shape: carriage, material: blue },
      { name: partNames.nut, shape: nut, material: bronze },
    ],
  };
}

export function mechanism(p = defaultParams) {
  validate(p);
  const lower = -p.carriagePosition;
  const upper = p.travel - p.carriagePosition;
  return {
    schemaVersion: 1,
    units: { length: 'mm', angle: 'deg' },
    root: 'frame',
    links: {
      frame: {
        shapes: [
          partNames.base,
          partNames.nearRail,
          partNames.farRail,
          partNames.frontBearing,
          partNames.rearBearing,
        ],
      },
      spindle: {
        shapes: [partNames.spindle, partNames.wheel, partNames.handle],
      },
      carriage: { shapes: [partNames.carriage, partNames.nut] },
    },
    joints: {
      turn: {
        type: 'revolute',
        name: 'Handwheel',
        parent: 'frame',
        child: 'spindle',
        origin: [0, 0, 13],
        axis: [1, 0, 0],
        limits: {
          lower: (lower * 360) / p.lead,
          upper: (upper * 360) / p.lead,
        },
      },
      slide: {
        type: 'prismatic',
        name: 'Carriage travel',
        parent: 'frame',
        child: 'carriage',
        origin: [20 + p.carriagePosition, 0, 13],
        axis: [1, 0, 0],
        limits: { lower, upper },
      },
    },
    couplings: [{ driver: 'turn', follower: 'slide', ratio: p.lead / 360 }],
    animations: [
      {
        id: 'traverse',
        name: 'Traverse and return',
        duration: 4,
        loop: 'repeat',
        keyframes: [
          { time: 0, coordinates: { turn: 0 } },
          { time: 1, coordinates: { turn: (lower * 360) / p.lead } },
          { time: 3, coordinates: { turn: (upper * 360) / p.lead } },
          { time: 4, coordinates: { turn: 0 } },
        ],
      },
    ],
  } satisfies MechanismSource<ShapeName>;
}
