/**
 * The case-fold collision check one cut runs before it mints a revision.
 *
 * Moved out of `revision-effects.ts` unchanged (W10.1): it was module-level
 * there already and depends on nothing in `createRevisionActors`.
 */
import type { ImmutableRevisionTree } from '#algorithms/index.js';

/**
 * Paths that differ only by case, which a case-insensitive disk cannot
 * materialize as two files.
 *
 * Refused at the cut rather than at the write: the tree model accepts them
 * (W3a review), and a revision nobody can check out is worse than a failed cut.
 *
 * @param tree - The captured tree.
 * @returns The colliding paths, or an empty array.
 */
export const caseCollisions = (tree: ImmutableRevisionTree): readonly string[] => {
  const seen = new Map<string, string>();
  const collisions: string[] = [];
  for (const { path } of tree.entries()) {
    const folded = path.toLowerCase();
    const first = seen.get(folded);
    if (first === undefined) {
      seen.set(folded, path);
      continue;
    }
    collisions.push(first, path);
  }
  return collisions;
};
