import type { ShapeConfig } from 'replicad';
import { makeCylinderHead } from '../lib/cylinder-head.js';
import { defaultParams, type Params } from '../lib/params.js';

export { defaultParams };

export default function main(p: Params = defaultParams): ShapeConfig[] {
  return [
    { shape: makeCylinderHead(p), color: '#55575d', name: 'Cylinder Head' },
  ];
}
