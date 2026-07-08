/**
 * Block part export (spec 3.1): `Block 1` in the Section 1.5 frame (origin
 * at the front face on the crank axis, +X rearward, +Z up the vee bisector).
 */
import { Placement } from '../lib/frame.js';
import { buildBlock } from '../lib/block.js';

export default function main() {
  const { shape, interfaces } = buildBlock(Placement.identity);
  return [
    {
      shape,
      name: 'Block 1',
      interfaces,
      color: '#79808a',
      density: 7.2,
    },
  ];
}
