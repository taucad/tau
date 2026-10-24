import type { TombstoneFence } from '#api/projects/project-deletion.js';
import { commitTombstone } from '#api/git/store/commit.js';
import type { RepositoryStore } from '#api/git/store/port.js';

/**
 * A project deletion's fence over a store this process holds: the
 * maintenance worker's (tau-maintenance carries the delete-capable
 * credential) and the suites'. tau-api never builds one; its fence is
 * `executorTombstoneFence`, so the tombstone is committed by tau-storage
 * (DC1).
 *
 * @param store - The repository store.
 * @returns The fence.
 */
export const storeTombstoneFence =
  (store: RepositoryStore): TombstoneFence =>
  async ({ locator, committedBy, at }, signal) => {
    const { manifest } = await commitTombstone({ store, locator, committedBy, at }, signal);
    if (!manifest.tombstone) {
      throw new Error('Deletion fence missing');
    }
    return { tombstonedAt: manifest.tombstone.tombstonedAt, purgeAfter: manifest.tombstone.purgeAfter };
  };
