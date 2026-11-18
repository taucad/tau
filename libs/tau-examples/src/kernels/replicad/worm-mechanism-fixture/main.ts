import { makeBox, makeCylinder, type ShapeConfig } from 'replicad';
import type { MechanismSource } from '@taucad/kinematics';

// The worm gear system's mechanism on stand-in shapes. `replicad/worm-gear-system` builds a
// hob-generated 30-tooth wheel whose 30 B-spline gap cuts take about a minute in a browser;
// this fixture keeps its links, joints, coupling and shape names, so the Kinematics pane
// tests exercise the same mechanism without that build. Keep it in step with that example.
export const defaultParams = {
  wheelTeeth: 30,
};

const wheelZ = 49;
const wormZ = 89;
const steel = '#9aa3ad';
const bronze = '#b0793a';

export default function main(
  params: Partial<typeof defaultParams> = defaultParams,
): ShapeConfig[] {
  const p = { ...defaultParams, ...params };
  return [
    {
      name: 'Mounting base',
      shape: makeBox([-70, -45, 0], [70, 45, 8]),
      color: '#4c5560',
    },
    {
      // Built along +Z, then turned onto +X as the example's worm is.
      name: 'Single-start worm',
      shape: makeCylinder(10, 132, [0, 0, -66])
        .rotate(90, [0, 0, 0], [0, 1, 0])
        .translate([0, 0, wormZ]),
      color: steel,
    },
    {
      // Built about +Z, then turned onto -Y as the example's wheel is.
      name: `Bronze wheel - ${p.wheelTeeth} teeth`,
      shape: makeCylinder(32, 14, [0, 0, -7])
        .rotate(90, [0, 0, 0], [1, 0, 0])
        .translate([0, 0, wheelZ]),
      color: bronze,
    },
  ];
}

export function mechanism(
  params: Partial<typeof defaultParams> = defaultParams,
) {
  const p = { ...defaultParams, ...params };
  return {
    schemaVersion: 1,
    units: { length: 'mm', angle: 'deg' },
    root: 'base',
    links: {
      base: { shapes: ['Mounting base'] },
      worm: { shapes: ['Single-start worm'] },
      wheel: { shapes: [`Bronze wheel - ${p.wheelTeeth} teeth`] },
    },
    joints: {
      worm: {
        type: 'revolute',
        parent: 'base',
        child: 'worm',
        origin: [0, 0, wormZ],
        axis: [1, 0, 0],
      },
      wheel: {
        type: 'revolute',
        parent: 'base',
        child: 'wheel',
        origin: [0, 0, wheelZ],
        axis: [0, 1, 0],
      },
    },
    couplings: [
      { driver: 'worm', follower: 'wheel', ratio: -1 / p.wheelTeeth },
    ],
  } satisfies MechanismSource;
}
