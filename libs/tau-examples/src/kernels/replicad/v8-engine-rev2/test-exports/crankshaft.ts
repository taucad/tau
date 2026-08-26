/**
 * Crankshaft part export (spec 3.2): `Crankshaft 1` in part-local frame
 * (mains axis = +X, front face datum at the spec stations, P1 throw at +Z).
 */
import { Placement } from '../lib/frame.js';
import { buildCrankshaft } from '../lib/crank.js';

export default function main() {
  const { shape, interfaces } = buildCrankshaft(Placement.identity);
  return [
    {
      shape,
      name: 'Crankshaft 1',
      interfaces,
      color: '#6f7378',
      density: 7.85,
    },
  ];
}
