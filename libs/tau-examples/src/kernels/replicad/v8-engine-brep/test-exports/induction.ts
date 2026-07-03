import type { ShapeConfig } from 'replicad';
import { makeIntakeParts } from '../lib/intake.js';
import { defaultParams, type Params } from '../lib/params.js';

export { defaultParams };

export default function main(p: Params = defaultParams): ShapeConfig[] {
  return makeIntakeParts(p);
}
