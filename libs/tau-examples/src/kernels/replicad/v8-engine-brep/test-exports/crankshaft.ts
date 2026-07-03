import type { ShapeConfig } from 'replicad';
import { makeCrankshaft } from '../lib/crankshaft.js';
import { defaultParams, type Params } from '../lib/params.js';

export { defaultParams };

export default function main(p: Params = defaultParams): ShapeConfig[] {
  return [{ shape: makeCrankshaft(p), color: '#c3c3cc', name: 'Crankshaft' }];
}
