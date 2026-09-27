import { buildSpar } from '../parts/airframe/spar.js';
import { buildMotorPad } from '../parts/airframe/motor-pad.js';
import { placeArm, placeClamp, sparAngle } from '../lib/airframe-geometry.js';
export const defaultParams = { sx: 1, sy: 1 };
export function buildArmModule(p = defaultParams) {
  if (![1, -1].includes(p.sx) || ![1, -1].includes(p.sy)) {
    throw new Error('Quadrant signs must be +/-1');
  }
  const { sx, sy } = p;
  const name = `${sx < 0 ? 'F' : 'R'}${sy < 0 ? 'L' : 'R'}`;
  const angle = sparAngle(sx, sy);
  const d = Math.hypot(33, 75);
  return [
    {
      name: `AF-003 Arm ${name}`,
      shape: placeArm(sx, sy),
      color: '#e95420',
      roughness: 0.38,
    },
    {
      name: `AF-004 Spar ${name}`,
      shape: buildSpar()
        .rotate(angle, [0, 0, 0], [0, 0, 1])
        .translate([sx * (85 - (69 * 33) / d), sy * (85 - (69 * 75) / d), 0]),
      color: '#232b30',
    },
    {
      name: `AF-005 Root clamp ${name}`,
      shape: placeClamp(sx, sy),
      color: '#48535b',
    },
    {
      name: `AF-006 Motor pad ${name}`,
      shape: buildMotorPad()
        .rotate(angle, [0, 0, 0], [0, 0, 1])
        .translate([sx * 85, sy * 85, 0]),
      color: '#363f46',
    },
  ];
}
export default function main(p = defaultParams) {
  return buildArmModule(p);
}
