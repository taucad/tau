import type { ShapeConfig } from 'replicad';
import { defaultParams, type Params } from '../lib/params.js';
import { makePiston } from '../lib/piston.js';

export { defaultParams };

export default function main(p: Params = defaultParams): ShapeConfig[] {
  return [{ shape: makePiston(p), color: '#d9d9de', name: 'Piston' }];
}
