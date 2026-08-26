/**
 * Connecting rod part export (spec 3.4): `Connecting Rod 1` in part-local
 * frame (big-end axis = X, small end at +z).
 */
import { Placement } from '../lib/frame.js';
import { buildConnectingRod } from '../lib/rod.js';

export default function main() {
  const { shape, interfaces } = buildConnectingRod(Placement.identity);
  return [
    {
      shape,
      name: 'Connecting Rod 1',
      interfaces,
      color: '#8a8f98',
      density: 7.85,
    },
  ];
}
