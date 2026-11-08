/**
 * The one large-object store a root may land objects from (W11.3, I6).
 *
 * An authority registers a store per root, and a write that names a large
 * object by its id is filled from that store alone. A root's admission may
 * name the store it wants, so the name is checked here: it must be the
 * repository's own Git LFS object directory, `<common dir>/lfs/objects`,
 * after every link in it is resolved. A path anywhere else (another
 * repository's store, a directory the caller chose, a link out of `.git`)
 * would let an admission point clones at bytes the repository does not own.
 */
import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

/* A path's real location: its nearest existing ancestor resolved, the missing rest appended. */
const realLocation = (candidate: string): string => {
  const missing: string[] = [];
  let current = path.resolve(candidate);
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    missing.unshift(path.basename(current));
    current = parent;
  }
  return path.join(realpathSync(current), ...missing);
};

/**
 * Check that `store` is `repositoryRoot`'s own LFS object directory.
 *
 * @param repositoryRoot - The repository the authority serves: its `.git` is a directory, the common dir.
 * @param store - The store an admission names.
 * @returns The store's real path, to register.
 * @throws An `EINVAL` error when the store is anywhere else, or the root has no repository of its own.
 * @public
 */
export const repositoryLargeObjectStore = (repositoryRoot: string, store: string): string => {
  const refuse = (reason: string): never => {
    throw Object.assign(new Error(`Refusing a large-object store: ${reason}`), { code: 'EINVAL' });
  };
  const gitDirectory = path.join(repositoryRoot, '.git');
  if (!existsSync(gitDirectory) || !statSync(gitDirectory).isDirectory()) {
    return refuse('the project has no repository of its own.');
  }
  const wanted = path.join(realpathSync(gitDirectory), 'lfs', 'objects');
  return realLocation(store) === wanted ? wanted : refuse("it is not the repository's own LFS object store.");
};
