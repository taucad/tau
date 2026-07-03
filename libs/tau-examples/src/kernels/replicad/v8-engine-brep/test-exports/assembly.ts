import type { ShapeConfig } from 'replicad';
import { makeEngine } from '../lib/assembly.js';
import { defaultParams, type Params } from '../lib/params.js';

export { defaultParams };

export default function main(p: Params = defaultParams): ShapeConfig[] {
  return makeEngine(p);
}
