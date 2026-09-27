import { drawRoundedRectangle } from 'replicad';

export const defaultParams = {};
export function buildReceiver() {
  return drawRoundedRectangle(16, 9, 1).sketchOnPlane('XY').extrude(3);
}

export default function main() {
  return [
    {
      shape: buildReceiver(),
      name: 'receiver-envelope',
      color: '#154e3e',
      roughness: 0.6,
    },
  ];
}
