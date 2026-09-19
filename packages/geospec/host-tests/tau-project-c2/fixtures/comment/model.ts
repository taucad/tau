/* oxlint-disable no-restricted-imports, import/extensions -- Relative dependency is the source-snapshot fixture. */
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Replicad supplies this virtual module to evaluated CAD source.
import { makeBaseBox } from 'replicad';
import { dimensions } from './dimensions.js';

type Model = { shape: ReturnType<typeof makeBaseBox>; name: string };

// This comment changes source identity without changing the authored solid.
/**
 * Build the comment-only fixture.
 * @returns The comment-only box.
 */
export default function main(): Model {
  return {
    shape: makeBaseBox(dimensions.width, dimensions.depth, dimensions.height),
    name: 'm4TauRuntimeBox',
  };
}
