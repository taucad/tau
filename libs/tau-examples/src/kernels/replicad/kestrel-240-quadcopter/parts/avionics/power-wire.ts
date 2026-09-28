import { draw, drawCircle, type Plane, type Sketch } from 'replicad';

export const defaultParams = {};

/** Ø2 mm insulated lead routing envelope, smoothly swept on an exact circular arc. */
export function buildPowerWire() {
  const path = draw([0, 0])
    .threePointsArcTo([0, 6], [3, 3])
    .done()
    .sketchOnPlane('XZ') as Sketch;
  return path.sweepSketch(
    (plane: Plane) => drawCircle(1).sketchOnPlane(plane) as Sketch,
  );
}

export default function main() {
  return [
    {
      shape: buildPowerWire(),
      name: 'insulated-power-lead-envelope',
      color: '#d83222',
      roughness: 0.75,
    },
  ];
}
