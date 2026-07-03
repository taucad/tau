import type { ShapeConfig } from 'replicad';
import { defaultParams, type Params } from '../lib/params.js';
import { makeWristPin } from '../lib/wrist-pin.js';

export { defaultParams };

export default function main(p: Params = defaultParams): ShapeConfig[] {
  return [{ shape: makeWristPin(p), color: '#8f8f97', name: 'Wrist Pin' }];
}
