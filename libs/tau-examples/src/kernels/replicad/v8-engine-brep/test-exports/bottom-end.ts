import type { ShapeConfig } from 'replicad';
import { makeBottomEndParts } from '../lib/bottom-end.js';
import { defaultParams, type Params } from '../lib/params.js';

export { defaultParams };

export default function main(p: Params = defaultParams): ShapeConfig[] {
  return makeBottomEndParts(p);
}
