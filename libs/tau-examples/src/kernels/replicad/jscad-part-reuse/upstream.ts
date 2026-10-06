import { primitives } from '@jscad/modeling';
import { upstreamSize } from './upstream.settings.js';

export default function main() {
  return Object.assign(primitives.cuboid({ size: [upstreamSize, 6, 10] }), {
    name: 'JSCAD insert',
  });
}
