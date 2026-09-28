import { drawPolysides, makeCylinder } from 'replicad';

export const defaultParams = {};

/** M5 prevailing-torque nut envelope, 8 mm across flats; no thread certification. */
export function buildPropNut() {
  return drawPolysides(8 / Math.sqrt(3), 6)
    .sketchOnPlane('XY')
    .extrude(4.5)
    .cut(makeCylinder(2.6, 4.7, [0, 0, -0.1]));
}

export default function main() {
  return [
    {
      shape: buildPropNut(),
      name: 'prop-nut-M5-envelope',
      color: '#d49244',
      metalness: 0.85,
      roughness: 0.22,
    },
  ];
}
