import { drawRoundedRectangle } from 'replicad';

export const defaultParams = {};

/** 6S battery pack maximum mechanical envelope; chemistry, cells and tabs remain supplier-owned. */
export function buildBattery() {
  return drawRoundedRectangle(70, 32, 4).sketchOnPlane('XY').extrude(34);
}

export default function main() {
  return [
    {
      shape: buildBattery(),
      name: 'battery-6S-envelope',
      color: '#343b45',
      roughness: 0.6,
    },
  ];
}
