import { makeCylinder } from 'replicad';

export const defaultParams = {};
export function buildBoardIsolator() {
  return makeCylinder(2.5, 1).cut(makeCylinder(1.1, 1.2, [0, 0, -0.1]));
}

export default function main() {
  return [
    {
      shape: buildBoardIsolator(),
      name: 'M2-silicone-isolator',
      color: '#ff5a24',
      roughness: 0.9,
    },
  ];
}
