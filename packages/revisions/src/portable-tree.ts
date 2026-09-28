import type { PathPolicy } from '@taucad/filesystem';
import type { ImmutableRevisionTree } from '#algorithms/index.js';
import { revisionTreeFiles } from '#algorithms/revision-tree.js';
import { portableCollisions } from '#case-collisions.js';
import { tauRevisionPolicy } from '#workspace-config.js';

import { RevisionPortError } from '#revision-port.js';

/**
 * Refuse a revision tree that no supported Tau checkout may materialize.
 *
 * @param tree - The tree about to be written or recorded.
 * @param policy - The layout's classifier (EQ6). An actor set passes the policy
 *   its project was opened with; an adapter writing a Tau store keeps the
 *   default, because a Tau store *is* Tau's layout.
 */
export const assertMaterializableRevisionTree = (
  tree: ImmutableRevisionTree,
  policy: PathPolicy = tauRevisionPolicy.policy,
): void => {
  /* Paths only: `entries()` copies every file's bytes (RV-W4W5a #6). */
  for (const path of [...revisionTreeFiles(tree).keys()].toSorted()) {
    if (!policy.classify(path).versioned) {
      throw new RevisionPortError('UNSUPPORTED_OPERATION', `Tracked path is reserved by Tau: ${path}`);
    }
  }
  const [collision] = portableCollisions(tree);
  if (collision !== undefined) {
    const [first, second] = collision.paths;
    throw new RevisionPortError(
      'UNSUPPORTED_OPERATION',
      collision.asDirectory
        ? `Tracked paths collide as a file and directory on a supported filesystem: ${first}, ${second}`
        : `Tracked paths collide on a supported filesystem: ${first}, ${second}`,
    );
  }
};
