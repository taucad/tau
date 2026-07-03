import type { ShapeConfig } from 'replicad';
import { makeBlock } from '../lib/block.js';
import { defaultParams, type Params } from '../lib/params.js';

export { defaultParams };

export default function main(p: Params = defaultParams): ShapeConfig[] {
  return [{ shape: makeBlock(p), color: '#5f6168', name: 'Block' }];
}
