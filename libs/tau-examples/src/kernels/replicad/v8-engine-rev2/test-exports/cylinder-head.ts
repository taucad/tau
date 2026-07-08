/**
 * Cylinder head part export (spec 3.5): the single-bank R head in
 * part-local frame (deck on XY at z=0, +y outboard).
 */
import { Placement } from '../lib/frame.js';
import { buildCylinderHead } from '../lib/head.js';

export default function main() {
  const { shape, interfaces } = buildCylinderHead(Placement.identity);
  return [
    {
      shape,
      name: 'Cylinder Head R',
      interfaces,
      color: '#b9bec4',
      density: 2.7,
    },
  ];
}
