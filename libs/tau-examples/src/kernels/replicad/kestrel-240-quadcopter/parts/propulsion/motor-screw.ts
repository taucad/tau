import { makeCylinder, drawPolysides } from 'replicad';

export const defaultParams = {};

/** M3 x 7 under-head interface envelope; thread omitted, 2 mm head included. */
export function buildMotorScrew() {
  const body = makeCylinder(2.7, 2).fuse(makeCylinder(1.45, 7.1, [0, 0, 1.9]));
  const drive = drawPolysides(1.15, 6).sketchOnPlane('XY', -0.1).extrude(1.1);
  return body.cut(drive);
}

export default function main() {
  return [
    {
      shape: buildMotorScrew(),
      name: 'motor-mount-screw-M3x7',
      color: '#77818e',
      metalness: 0.9,
      roughness: 0.3,
    },
  ];
}
