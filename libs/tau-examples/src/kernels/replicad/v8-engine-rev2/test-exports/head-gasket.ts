/**
 * Head gasket part export (spec 3.9): 36-opening blank at compressed
 * thickness, part-local frame (sheet on XY).
 */
import { Placement } from '../lib/frame.js';
import { buildHeadGasket } from '../lib/head.js';

export default function main() {
  const { shape, interfaces } = buildHeadGasket(Placement.identity);
  return [
    {
      shape,
      name: 'Head Gasket R',
      interfaces,
      color: '#9aa2ab',
      density: 7.8,
    },
  ];
}
