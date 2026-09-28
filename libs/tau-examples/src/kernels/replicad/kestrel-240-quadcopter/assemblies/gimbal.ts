import { type ShapeConfig, type Shape3D } from 'replicad';
import { buildCameraCartridge } from './camera-cartridge.js';
import { buildPitchYoke } from '../parts/gimbal/pitch-yoke.js';
import { buildFixedMount } from '../parts/gimbal/fixed-mount.js';
import { buildBearing } from '../parts/gimbal/bearing.js';
import { buildShoulderAxle } from '../parts/gimbal/shoulder-axle.js';
import { buildActuatorBody } from '../parts/gimbal/actuator-body.js';
import { buildActuatorShaft } from '../parts/gimbal/actuator-shaft.js';
import { buildMountScrew } from '../parts/gimbal/mount-screw.js';
import { buildThreadedInsert } from '../parts/gimbal/threaded-insert.js';

export const defaultParams = { pitchDeg: 0, yawDeg: 0 };
export function buildGimbal(
  parameters: Partial<typeof defaultParams> = {},
): ShapeConfig[] {
  const p = { ...defaultParams, ...parameters };
  if (
    !Number.isFinite(p.pitchDeg) ||
    !Number.isFinite(p.yawDeg) ||
    Math.abs(p.pitchDeg) > 25 ||
    Math.abs(p.yawDeg) > 12
  ) {
    throw new Error('Declared travel is pitch ±25° and yaw ±12°.');
  }
  const out: ShapeConfig[] = [];
  function add(
    name: string,
    shape: Shape3D,
    color: string,
    joint: 'camera' | 'yaw' | 'fixed',
    metalness = 0,
  ) {
    if (joint === 'camera') {
      shape = shape.rotate(p.pitchDeg, [5, 0, 0], [0, 1, 0]);
    }
    if (joint !== 'fixed') {
      shape = shape.rotate(p.yawDeg, [24, 0, 0], [0, 0, 1]);
    }
    out.push({
      name: `GIM_${name}`,
      shape: shape.translate([-94, 0, -4]),
      color,
      metalness,
      roughness: metalness ? 0.25 : 0.4,
    });
  }
  for (const part of buildCameraCartridge()) {
    add(
      part.name!.replace('GIM_', ''),
      part.shape as Shape3D,
      part.color!,
      'camera',
      part.metalness,
    );
  }
  add('pitch_yoke_PA12', buildPitchYoke(), '#db963b', 'yaw');
  add('fixed_mount_PA12', buildFixedMount(), '#243743', 'fixed');
  add(
    'pitch_bearing_3x8x3',
    buildBearing().rotate(-90, [0, 0, 0], [1, 0, 0]).translate([5, 18.4, 0]),
    '#acb9bd',
    'yaw',
    0.85,
  );
  add(
    'yaw_bearing_3x8x3',
    buildBearing().translate([24, 0, -1.5]),
    '#acb9bd',
    'yaw',
    0.85,
  );
  add(
    'pitch_shoulder_axle',
    buildShoulderAxle().rotate(90, [0, 0, 0], [1, 0, 0]).translate([5, 22, 0]),
    '#c2cbd0',
    'camera',
    0.85,
  );
  add(
    'pitch_actuator_VENDOR_ENVELOPE',
    buildActuatorBody()
      .rotate(-90, [0, 0, 0], [1, 0, 0])
      .translate([5, -22.4, 0]),
    '#4d5862',
    'yaw',
    0.8,
  );
  add(
    'pitch_drive_VENDOR_ENVELOPE',
    buildActuatorShaft()
      .rotate(-90, [0, 0, 0], [1, 0, 0])
      .translate([5, -18.3, 0]),
    '#d5dadd',
    'camera',
    0.85,
  );
  add(
    'yaw_actuator_VENDOR_ENVELOPE',
    buildActuatorBody().translate([24, 0, -12.5]),
    '#4d5862',
    'fixed',
    0.8,
  );
  add(
    'yaw_drive_VENDOR_ENVELOPE',
    buildActuatorShaft({ radius: 1.45, length: 10.2 }).translate([24, 0, -8.4]),
    '#d5dadd',
    'yaw',
    0.85,
  );
  for (const y of [-7, 7]) {
    add(
      `mount_screw_M2x8_${y < 0 ? 'left' : 'right'}`,
      buildMountScrew().translate([28.2, y, -8.2]),
      '#bdc8cf',
      'fixed',
      0.85,
    );
    add(
      `mount_insert_M2_${y < 0 ? 'left' : 'right'}`,
      buildThreadedInsert().translate([28.2, y, -5]),
      '#c1a468',
      'fixed',
      0.75,
    );
  }
  return out;
}
export default function main(p = defaultParams) {
  return buildGimbal(p);
}
