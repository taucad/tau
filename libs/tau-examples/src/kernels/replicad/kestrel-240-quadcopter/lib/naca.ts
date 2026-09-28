import { draw } from 'replicad';
import { nacaPoles } from './naca-math.js';

export const defaultParams = { chord: 50, thickness: 0.24, span: 20 };

type Point = [number, number];

// Degree-eight Bernstein poles: index 0 is the leading edge, index 8 the trailing station.
const pole = (points: Point[], index: number): Point => {
  const point = points[index];
  if (!point) {
    throw new Error(`Missing NACA pole ${index}`);
  }
  return point;
};

export function nacaProfile(chord: number, thickness: number, fraction = 1) {
  const upper = nacaPoles(chord, thickness, fraction);
  const lower = upper.map(([x, z]): Point => [x, -z]).reverse();
  const [tipX, tipZ] = pole(upper, 8);
  return draw(pole(upper, 0))
    .bezierCurveTo(pole(upper, 8), upper.slice(1, 8))
    .threePointsArcTo(pole(lower, 0), [tipX + tipZ, 0])
    .bezierCurveTo(pole(lower, 8), lower.slice(1, 8))
    .close();
}

export function nacaBody(chord = 176, thickness = 0.32) {
  const poles = nacaPoles(chord, thickness);
  const [x, r] = pole(poles, 8);
  return draw([0, 0])
    .bezierCurveTo(pole(poles, 8), poles.slice(1, 8))
    .threePointsArcTo([x + r, 0], [x + r / Math.sqrt(2), r / Math.sqrt(2)])
    .lineTo([0, 0])
    .close()
    .sketchOnPlane('XZ')
    .revolve([1, 0, 0]);
}

export default function main(p = defaultParams) {
  return nacaProfile(p.chord, p.thickness)
    .sketchOnPlane('XZ')
    .extrude(p.span, { extrusionDirection: [0, 1, 0] });
}
