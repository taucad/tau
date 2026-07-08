/**
 * Exhaust header part export (spec 3.8): the bank-R header weldment
 * modeled IN PLACE (Section 1.5 frame — REQ-003 claim-2 canon).
 */
import { Placement } from '../lib/frame.js';
import { buildExhaustHeader } from '../lib/exhaust.js';

export default function main() {
  const { shape, interfaces } = buildExhaustHeader(Placement.identity);
  return [
    {
      shape,
      name: 'Exhaust Header R',
      interfaces,
      color: '#a7a29a',
      density: 7.9,
    },
  ];
}
