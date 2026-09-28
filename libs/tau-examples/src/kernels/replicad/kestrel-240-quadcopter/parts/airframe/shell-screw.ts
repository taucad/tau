import { makeCylinder, drawPolysides } from 'replicad';
export const defaultParams = {};
export function buildShellScrew() {
  return makeCylinder(1.25, 8, [0, 0, -8])
    .fuse(makeCylinder(2.25, 2).fillet(0.35))
    .cut(drawPolysides(0.85, 6).sketchOnPlane('XY', 1).extrude(2));
}
export default function main() {
  return buildShellScrew();
}
