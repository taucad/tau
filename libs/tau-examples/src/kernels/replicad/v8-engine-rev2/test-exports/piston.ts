/**
 * Piston part export (spec 3.3): `Piston 1` in part-local frame
 * (z = bore axis, x = pin axis, crown top at z = +32.5).
 */
import { Placement } from '../lib/frame.js';
import { buildPiston } from '../lib/piston-group.js';

export default function main() {
  const { shape, interfaces } = buildPiston(Placement.identity);
  return [
    {
      shape,
      name: 'Piston 1',
      interfaces,
      color: '#c8ccd0',
      density: 2.7,
    },
  ];
}
