import { makeCylinder, drawPolysides } from 'replicad';

export const defaultParams = {};

/** M2 x 15 mm screw envelope, inserted downwards from the flight controller. */
export function buildBoardScrew() {
  return makeCylinder(1, 15.1)
    .fuse(makeCylinder(1.9, 1.6, [0, 0, 15]))
    .cut(drawPolysides(0.8, 6).sketchOnPlane('XY', 15.8).extrude(0.9));
}

export default function main() {
  return [
    {
      shape: buildBoardScrew(),
      name: 'board-screw-M2x15',
      color: '#929aa4',
      metalness: 0.8,
    },
  ];
}
