import { makeCylinder } from 'replicad';

export const defaultParams = {};

/** Opaque laminated stator and winding envelope, not a motor manufacturing design. */
export function buildMotorStator() {
  return makeCylinder(11, 16.6).cut(makeCylinder(5.65, 16.8, [0, 0, -0.1]));
}

export default function main() {
  return [
    {
      shape: buildMotorStator(),
      name: 'motor-stator-envelope',
      color: '#b77539',
      metalness: 0.8,
      roughness: 0.28,
    },
  ];
}
