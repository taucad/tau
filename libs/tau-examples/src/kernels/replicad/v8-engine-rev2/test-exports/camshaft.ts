/**
 * Camshaft part export (spec 3.6): `Camshaft 1` in part-local frame
 * (axis = +X at the origin; lobes at their modeled firing phases).
 */
import { Placement } from '../lib/frame.js';
import { buildCamshaft } from '../lib/valvetrain.js';

export default function main() {
  const { shape, interfaces } = buildCamshaft(Placement.identity);
  return [
    {
      shape,
      name: 'Camshaft 1',
      interfaces,
      color: '#5e6368',
      density: 7.3,
    },
  ];
}
