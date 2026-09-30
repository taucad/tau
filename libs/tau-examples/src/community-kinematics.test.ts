import { evaluatePose, resolveMechanismComponents } from '@taucad/kinematics';
import type { MechanismSource, Mechanism } from '@taucad/kinematics';
import { describe, expect, it } from 'vitest';
import * as kestrel from '#kernels/replicad/kestrel-240-quadcopter/main.js';
import * as gearbox from '#kernels/replicad/spur-gearbox/main.js';
import * as vice from '#kernels/replicad/bench-vise/main.js';
import * as fan from '#kernels/replicad/standing-fan/main.js';
import * as wheelbarrow from '#kernels/replicad/wheelbarrow/main.js';

const examples = { kestrel, gearbox, vice, fan, wheelbarrow };
describe('Community motion assemblies', () => {
  it.each(Object.entries(examples))('should publish a mechanism for %s', (_name, module) => {
    expect(module).toHaveProperty('mechanism', expect.any(Function));
  });
});

function resolve(source: MechanismSource): Mechanism {
  const names = Object.values(source.links).flatMap((link) => link.shapes);
  expect(new Set(names).size).toBe(names.length);
  const result = resolveMechanismComponents({
    source,
    componentIds: Object.fromEntries(names.map((name) => [name, name])),
  });
  if (result.status !== 'resolved') {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.mechanism;
}

function pose(source: MechanismSource, coordinates: Record<string, number>) {
  const result = evaluatePose({ mechanism: resolve(source), coordinates });
  if (result.status !== 'posed') {
    throw new Error(JSON.stringify(result.issues));
  }
  expect(result.atLimit).toEqual([]);
  return result.pose;
}

it('should couple the 18/54 gears and lift the complete cover assembly', () => {
  const source = gearbox.mechanism({ inputAngle: 40, coverLift: 12 })!;
  const motion = pose(source, { input: 360, cover: 20 });
  expect(motion.coordinates['output']).toBeCloseTo(-120);
  expect(motion.linkTransforms['cover']![14]).toBeCloseTo(20);
  expect(source.links['input']!.shapes).toEqual(['Input pinion', 'Input shaft', 'Input key']);
  expect(source.links['cover']!.shapes).toContain('Input upper bearing');
  expect(source.joints['cover']).toMatchObject({ limits: { lower: -12, upper: 68 } });
  expect(Object.values(source.links).flatMap((link) => link.shapes)).toHaveLength(19);
});

it('should advance the vice jaw by 4mm per spindle turn and clock the sliding handle', () => {
  const source = vice.mechanism({ opening: 56, handleOffset: 20 })!;
  const motion = pose(source, { spindle: 360 });
  expect(motion.coordinates['travel']).toBeCloseTo(4);
  expect(motion.linkTransforms['carriage']![12]).toBeCloseTo(4);
  expect(source.joints['handle']).toMatchObject({ limits: { lower: -80, upper: 40 } });
  expect(source.joints['handle']).toMatchObject({ axis: [0, expect.closeTo(0), expect.closeTo(1)] });
  expect(source.links['spindle']!.shapes).toEqual(['Spindle', 'Handle hub', 'Hub pin']);
  expect(Object.values(source.links).flatMap((link) => link.shapes)).toHaveLength(21);
});

it('should carry the fan tilt and rotor axes through the as-built yaw and tilt', () => {
  const source = fan.mechanism({ headHeight: 1240, tilt: 20, yaw: 30, bladeCount: 7 })!;
  const radians = Math.PI / 180;
  expect(source.joints['height']).toMatchObject({ limits: { lower: -220, upper: 80 } });
  expect(source.joints['yaw']).toMatchObject({ limits: { lower: -75, upper: 15 } });
  expect(source.joints['tilt']).toMatchObject({
    origin: [expect.closeTo(17.5), expect.closeTo(70 - 35 * Math.cos(30 * radians)), 1200],
    axis: [expect.closeTo(Math.cos(30 * radians)), expect.closeTo(0.5), 0],
    limits: { lower: -35, upper: 5 },
  });
  expect(source.joints['rotor']).toMatchObject({
    axis: [
      expect.closeTo(-Math.cos(20 * radians) * 0.5),
      expect.closeTo(Math.cos(20 * radians) * Math.cos(30 * radians)),
      expect.closeTo(Math.sin(20 * radians)),
    ],
  });
  expect(source.links['rotor']!.shapes).toHaveLength(9);
  expect(pose(source, { height: 30 }).linkTransforms['rotor']![14]).toBeCloseTo(30);
});

it('should rotate only the wheelbarrow tire and rim about the actual axle', () => {
  const source = wheelbarrow.mechanism()!;
  expect(source.links['wheel']!.shapes).toEqual(['Tire', 'Wheel rim']);
  expect(source.links['frame']!.shapes).toContain('Axle');
  expect(source.joints['wheel']).toMatchObject({ origin: [-540, 0, 190], axis: [0, 1, 0] });
  expect(pose(source, { wheel: 90 }).linkTransforms['frame']).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
});

it.each([-25, 0, 25])('should retain all Kestrel rigid groups at pitch %s', (pitchDeg) => {
  for (const yawDeg of [-12, 0, 12]) {
    const source = kestrel.mechanism({ pitchDeg, yawDeg });
    expect(Object.values(source.links).flatMap((link) => link.shapes)).toHaveLength(123);
    expect(Object.keys(source.joints)).toHaveLength(6);
    expect(source.animations).toHaveLength(4);
    expect(source.joints['camera-pitch']).toMatchObject({
      parent: 'yoke',
      axis: [
        expect.closeTo(-Math.sin((yawDeg * Math.PI) / 180)),
        expect.closeTo(Math.cos((yawDeg * Math.PI) / 180)),
        0,
      ],
      limits: { lower: -25 - pitchDeg, upper: 25 - pitchDeg },
    });
    for (const clip of source.animations) {
      for (const frame of clip.keyframes) {
        pose(source, frame.coordinates);
      }
    }
  }
});

it('should keep every declared clip inside its mechanism travel from nonzero as-built parameters', () => {
  for (const source of [
    gearbox.mechanism({ coverLift: 70 })!,
    vice.mechanism({ opening: 80, handleOffset: -40 })!,
    fan.mechanism({ headHeight: 1300, yaw: 40, tilt: 20 })!,
    wheelbarrow.mechanism()!,
  ]) {
    for (const clip of source.animations ?? []) {
      for (const frame of clip.keyframes) {
        pose(source, frame.coordinates);
      }
    }
  }
});

it('should omit assembly motion for isolated component builds', () => {
  expect(gearbox.mechanism({ part: 'gears' })).toBeUndefined();
  expect(vice.mechanism({ component: 'Spindle' })).toBeUndefined();
  expect(fan.mechanism({ part: 'blades' })).toBeUndefined();
  expect(wheelbarrow.mechanism({ part: 'Tire' })).toBeUndefined();
});
