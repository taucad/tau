/**
 * Cross-plane 90° V8 engine — full assembly entry point.
 * See spec/v8-engine.sysml2 for the component specification and lib/* for
 * the per-component parametric models.
 */
import type { ShapeConfig } from 'replicad';
import { defaultParams as defaultParameters } from './lib/params.js';
import { makeEngine } from './lib/assembly.js';

export { defaultParameters as defaultParams };

export default function main(p = defaultParameters): ShapeConfig[] {
  return makeEngine(p);
}
