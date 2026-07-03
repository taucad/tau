import type { ShapeConfig } from 'replicad';
import { makeFlywheel } from '../lib/flywheel.js';
import { defaultParams, type Params } from '../lib/params.js';

export { defaultParams };

export default function main(p: Params = defaultParams): ShapeConfig[] {
  return [{ shape: makeFlywheel(p), color: '#9a9aa2', name: 'Flywheel' }];
}
