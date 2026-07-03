import type { ShapeConfig } from 'replicad';
import { defaultParams, type Params } from '../lib/params.js';
import { makeValvetrainParts } from '../lib/valvetrain.js';

export { defaultParams };

export default function main(p: Params = defaultParams): ShapeConfig[] {
  return makeValvetrainParts(p);
}
