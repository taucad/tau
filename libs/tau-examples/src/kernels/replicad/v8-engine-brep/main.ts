/**
 * BRep-native cross-plane 90deg V8 engine reference fixture.
 *
 * This sibling of v8-engine-block intentionally keeps the same visible model
 * family while avoiding avoidable boolean construction. It is used as a
 * canonical Replicad/OCJS performance reference for Tau benchmarks.
 */
import type { ShapeConfig } from 'replicad';
import { defaultParams } from './lib/params.js';
import { makeEngine } from './lib/assembly.js';

export { defaultParams };

export default function main(p = defaultParams): ShapeConfig[] {
  return makeEngine(p);
}
