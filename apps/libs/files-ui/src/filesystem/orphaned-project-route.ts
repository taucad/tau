import type { ScopedStorageClient } from '@taucad/fs-client/file-system-client';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';

/**
 * Whether a Home route config names a folder with no file left in it (R14).
 *
 * A browser that clears its storage can drop every file while the IndexedDB
 * rows keyed by the project id survive (the route config, editor layout and
 * library state). Discovery reads `tau.json`, so the project vanishes from the
 * library, yet the surviving config still answers "already on this device"
 * when the same project is imported again. Only browser storage is evictable:
 * a folder on disk is never judged here.
 *
 * The answer is `true` only when a successful listing proves it: the folder is
 * absent from a readable root, or every directory under it was listed and none
 * holds a file. Any unreadable level answers `false`, so a project whose files
 * may still exist is never treated as gone.
 *
 * @param config - The route config the id still has.
 * @param storage - The authority's physical-scope reads.
 * @returns Whether the config is all that is left of the project.
 */
export async function isOrphanedProjectRoute(
  config: ProjectFileSystemConfig,
  storage: Pick<ScopedStorageClient, 'readShallowDirectory'>,
): Promise<boolean> {
  if (config.backend !== 'opfs' && config.backend !== 'indexeddb') {
    return false;
  }
  const scope = { backend: config.backend };
  try {
    const root = await storage.readShallowDirectory('/', { scope });
    const folder = root.find((node) => node.name === config.providerBasePath);
    if (folder === undefined) {
      return true;
    }
    if (folder.children === undefined) {
      return false;
    }
    const pending = [folder.id];
    /* oxlint-disable no-await-in-loop -- Stops at the first file; a live project answers on its first level. */
    for (let directory = pending.pop(); directory !== undefined; directory = pending.pop()) {
      for (const node of await storage.readShallowDirectory(directory, { scope })) {
        if (node.children === undefined) {
          return false;
        }
        pending.push(node.id);
      }
    }
    /* oxlint-enable no-await-in-loop */
    return true;
  } catch {
    return false;
  }
}
