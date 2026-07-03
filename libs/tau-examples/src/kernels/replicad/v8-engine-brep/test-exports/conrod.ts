import type { ShapeConfig } from 'replicad';
import { makeConrod } from '../lib/conrod.js';
import { defaultParams, type Params } from '../lib/params.js';

export { defaultParams };

export default function main(p: Params = defaultParams): ShapeConfig[] {
  return [{ shape: makeConrod(p), color: '#b0b0b8', name: 'Con Rod' }];
}
