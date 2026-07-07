import { makeBaseBox } from 'replicad';
import { face } from '@taucad/runtime/kernels/replicad/annotations';

// Audit row `contact.edge-only-negative`: two solids touch along a line with
// zero planar seating area — distance is 0 but a `minContactArea: 20`
// contact expectation must fail.
export const defaultParams = {
  tiltDegrees: 45, // Degrees - block rotation about its front-bottom edge resting on the base
};

export default function main(p = defaultParams) {
  // Base block z ∈ [0, 20], top face z = 20.
  const base = makeBaseBox(40, 40, 20);

  // Resting block starts flat on the base (z ∈ [20, 40], y ∈ [-10, 10]) and
  // tips about its y = -10 bottom edge, leaving only that edge line touching.
  const pivot: [number, number, number] = [0, -10, 20];
  const block = makeBaseBox(20, 20, 20).translate([0, 0, 20]).rotate(p.tiltDegrees, pivot, [1, 0, 0]);

  // Probe the block's (tilted) former bottom face at its displaced center:
  // the face center [0, 0, 20] rotated about the pivot line.
  const radians = (p.tiltDegrees * Math.PI) / 180;
  const seatProbe: [number, number, number] = [0, -10 + 10 * Math.cos(radians), 20 + 10 * Math.sin(radians)];

  return [
    { shape: base, name: 'base', interfaces: { top: face((f) => f.inPlane('XY', 20)) } },
    { shape: block, name: 'block', interfaces: { seat: face((f) => f.containsPoint(seatProbe)) } },
  ];
}
