/**
 * Front cover part export (spec 3.10): `Front Cover 1` in the Section 1.5
 * frame (bolts over the block front face; pump pocket on the crank axis).
 */
import { Placement } from '../lib/frame.js';
import { buildFrontCover } from '../lib/covers.js';

export default function main() {
  const { shape, interfaces } = buildFrontCover(Placement.identity);
  return [
    {
      shape,
      name: 'Front Cover 1',
      interfaces,
      color: '#9aa1a8',
      density: 2.7,
    },
  ];
}
