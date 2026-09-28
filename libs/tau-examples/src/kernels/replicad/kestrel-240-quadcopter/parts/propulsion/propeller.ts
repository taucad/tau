import { drawEllipse, makeCylinder, type Sketch } from 'replicad';

export const defaultParams = { handedness: 'CW' };

/**
 * Purchased 5-inch three-blade propeller mechanical envelope.
 * Smooth elliptic-section lofts are deliberately NOT the supplier airfoils.
 * NOT FOR FLIGHT PRINTING: blade stress, balance and performance are unvalidated.
 */
export function buildPropeller(p = defaultParams) {
  if (p.handedness !== 'CW' && p.handedness !== 'CCW') {
    throw new Error('Propeller handedness must be CW or CCW.');
  }
  // [radius, halfChord, halfThickness, pitch, sweep]
  const stations: Array<[number, number, number, number, number]> = [
    [5, 4, 0.9, 30, 0],
    [10, 7, 0.85, 20, 0],
    [25, 8.5, 0.7, 21, 0.5],
    [43, 7, 0.6, 16, 1.2],
    [57, 4, 0.4, 12, 1.4],
    [62, 1, 0.18, 10, 0.5],
  ];
  const sections = stations.map(
    ([radius, halfChord, halfThickness, pitch, sweep]) =>
      drawEllipse(halfChord, halfThickness)
        .rotate(pitch)
        .sketchOnPlane('YZ', [radius, sweep, 0]) as Sketch,
  );
  const [root, ...outer] = sections as [Sketch, ...Sketch[]];
  const blade = root.loftWith(outer, { ruled: false, endPoint: [63.5, 0, 0] });
  const hub = makeCylinder(7.5, 5.5, [0, 0, -3]);
  const rotor = hub
    .fuseAll([0, 120, 240].map((angle) => blade.clone().rotate(angle)))
    .cut(makeCylinder(2.6, 8, [0, 0, -4]));
  return p.handedness === 'CCW' ? rotor.mirror('XZ') : rotor;
}

export default function main(p = defaultParams) {
  return [
    {
      shape: buildPropeller(p),
      name: `propeller-127mm-${p.handedness}-UNVALIDATED`,
      color: '#ff4e16',
      metalness: 0.05,
      roughness: 0.28,
    },
  ];
}
