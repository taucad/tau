/* oxlint-disable no-restricted-imports, import/extensions -- Relative dependency is the source-snapshot fixture. */
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Replicad supplies this virtual module to evaluated CAD source.
import { makeBaseBox } from 'replicad';
import { dimensions } from './dimensions.js';

type Model = { shape: ReturnType<typeof makeBaseBox>; name: string };

/**
 * Build the dimension-change fixture.
 * @returns The dimension-changed box.
 */
export default function main(): Model {
  return {
    shape: makeBaseBox(dimensions.width, dimensions.depth, dimensions.height),
    name: 'm4TauRuntimeBox',
  };
}
