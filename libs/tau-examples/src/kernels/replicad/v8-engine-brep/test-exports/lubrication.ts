import type { ShapeConfig } from 'replicad';
import { makeLubricationCoolingParts } from '../lib/lubrication-cooling.js';
import { defaultParams, type Params } from '../lib/params.js';

export { defaultParams };

export default function main(p: Params = defaultParams): ShapeConfig[] {
  return makeLubricationCoolingParts(p);
}
