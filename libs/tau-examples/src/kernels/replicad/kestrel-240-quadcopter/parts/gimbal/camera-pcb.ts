import { drawRoundedRectangle, type Shape3D } from 'replicad';

// Vendor camera PCB keep-in only. No optical/electrical manufacturing claim.
export const defaultParams = { width: 13, height: 13, thickness: 1.2 };
export function buildCameraPcb(p = defaultParams): Shape3D {
  if (Math.min(p.width, p.height) < 4 || p.thickness <= 0) {
    throw new Error('Invalid camera board envelope.');
  }
  return drawRoundedRectangle(p.width, p.height, 1)
    .sketchOnPlane('YZ')
    .extrude(p.thickness);
}
export default function main(p = defaultParams) {
  return buildCameraPcb(p);
}
