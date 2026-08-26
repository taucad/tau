/**
 * Exhaust gasket part export (spec 3.9): bank-R MLS flange gasket
 * modeled in place against the head outboard flange.
 */
import { Placement } from '../lib/frame.js';
import { buildExhaustGasket } from '../lib/exhaust.js';

export default function main() {
  const { shape, interfaces } = buildExhaustGasket(Placement.identity);
  return [
    {
      shape,
      name: 'Exhaust Gasket R',
      interfaces,
      color: '#8f959c',
      density: 7.8,
    },
  ];
}
