import type { PathPolicy } from '@taucad/filesystem';
import type { ImmutableRevisionTree } from '#algorithms/index.js';
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
  const portablePaths = new Map<string, string>();
  for (const { path } of tree.entries()) {
    if (!policy.classify(path).versioned) {
      throw new RevisionPortError('UNSUPPORTED_OPERATION', `Tracked path is reserved by Tau: ${path}`);
    }
    const portable = path.normalize('NFC').toLowerCase();
    const collision = portablePaths.get(portable);
    if (collision !== undefined && collision !== path) {
      throw new RevisionPortError(
        'UNSUPPORTED_OPERATION',
        `Tracked paths collide on a supported filesystem: ${collision}, ${path}`,
      );
    }
    portablePaths.set(portable, path);
  }
  for (const [portable, path] of portablePaths) {
    for (let index = portable.indexOf('/'); index !== -1; index = portable.indexOf('/', index + 1)) {
      const collision = portablePaths.get(portable.slice(0, index));
      if (collision !== undefined) {
        throw new RevisionPortError(
          'UNSUPPORTED_OPERATION',
          `Tracked paths collide as a file and directory on a supported filesystem: ${collision}, ${path}`,
        );
      }
    }
  }
};
