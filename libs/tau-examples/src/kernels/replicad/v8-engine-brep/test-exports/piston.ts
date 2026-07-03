import type { ShapeConfig } from 'replicad';
import { defaultParams, type Params } from '../lib/params.js';
import { makePiston, makePistonRing } from '../lib/piston.js';

export { defaultParams };

export default function main(p: Params = defaultParams): ShapeConfig[] {
  return [
    { shape: makePiston(p), color: '#d9d9de', name: 'Piston' },
    {
      shape: makePistonRing(p, 0),
      color: '#242426',
      name: 'Compression Ring 1',
    },
    {
      shape: makePistonRing(p, 1),
      color: '#242426',
      name: 'Compression Ring 2',
    },
    { shape: makePistonRing(p, 2), color: '#242426', name: 'Oil Control Ring' },
  ];
}
