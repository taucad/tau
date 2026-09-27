import { makeCylinder } from 'replicad';

export const defaultParams = {};
export function buildMotorShaft() {
  return makeCylinder(2.5, 33);
}

export default function main() {
  return [
    {
      shape: buildMotorShaft(),
      name: 'motor-shaft-5mm-envelope',
      color: '#b8c1ca',
      metalness: 0.95,
      roughness: 0.18,
    },
  ];
}
