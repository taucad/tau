import { classify } from '@taucad/filesystem/path-registry';
import type { ImmutableRevisionTree } from '#algorithms/index.js';

import { RevisionPortError } from '#revision-port.js';

/** Refuse a revision tree that no supported Tau checkout may materialize. */
export const assertMaterializableRevisionTree = (tree: ImmutableRevisionTree): void => {
  const portablePaths = new Map<string, string>();
  for (const { path } of tree.entries()) {
    if (!classify(path).versioned) {
      throw new RevisionPortError('UNSUPPORTED_OPERATION', `Tracked path is reserved by Tau: ${path}`);
    }
    const portable = path.normalize('NFC').toLowerCase();
    if (!classify(portable).versioned) {
      throw new RevisionPortError('UNSUPPORTED_OPERATION', `Tracked path aliases a path reserved by Tau: ${path}`);
    }
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
