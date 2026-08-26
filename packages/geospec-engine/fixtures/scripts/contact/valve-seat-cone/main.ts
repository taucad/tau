import { draw } from 'replicad';
import { face } from '@taucad/replicad/annotations';

// Serves `contact.valve-seat-cone-positive`: a valve-seat insert whose 45°
// seat cone band carries the seating patch — the SB4 contact-area frontier's
// cone-projection case (the REQ-V8R2-111 valve-seat cone-band family). The
// valve plug's mirrored 45° cone coincides with the seat cone over the full
// band, so the analytic patch equals the band's lateral (frustum) area:
// π·(10 + 13)·3·√2 ≈ 306.548 mm². Both parts are revolved profiles so every
// surface is exactly analytic (planes, cylinders, one cone each).
export const defaultParams = {};

export default function main(_p = defaultParams) {
  // Seat insert ring z ∈ [0, 6]: OD r16, bore r10, and the 45° seat cone
  // band rising from (r10, z3) to (r13, z6).
  const seat = draw([10, 3])
    .lineTo([13, 6])
    .lineTo([16, 6])
    .lineTo([16, 0])
    .lineTo([10, 0])
    .close()
    .sketchOnPlane('XZ')
    .revolve();

  // Valve plug z ∈ [3, 10]: r13 body whose 45° face cone from (r10, z3) to
  // (r13, z6) seats flush on the insert's cone band.
  const valve = draw([0, 3])
    .lineTo([10, 3])
    .lineTo([13, 6])
    .lineTo([13, 10])
    .lineTo([0, 10])
    .close()
    .sketchOnPlane('XZ')
    .revolve();

  return [
    {
      shape: seat,
      name: 'seat',
      interfaces: { seatCone: face((f) => f.ofSurfaceType('CONE')) },
    },
    {
      shape: valve,
      name: 'valve',
      interfaces: { seatFace: face((f) => f.ofSurfaceType('CONE')) },
    },
  ];
}
