import type { ShapeConfig } from 'replicad';
import { makeFastenerAndGasketParts } from '../lib/fasteners.js';
import { defaultParams, type Params } from '../lib/params.js';

export { defaultParams };

export default function main(p: Params = defaultParams): ShapeConfig[] {
  return makeFastenerAndGasketParts(p);
}
