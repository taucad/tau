import type { ShapeConfig } from 'replicad';
import { makeExhaustParts } from '../lib/exhaust.js';
import { defaultParams, type Params } from '../lib/params.js';

export { defaultParams };

export default function main(p: Params = defaultParams): ShapeConfig[] {
  return makeExhaustParts(p);
}
