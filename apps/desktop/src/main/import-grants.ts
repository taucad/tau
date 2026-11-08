/**
 * Grants for sources a person chose to import (W7.4, charter D12, I6).
 *
 * Choosing a folder in the import picker, or opening a file with Tau, is the
 * admission event. Main mints an opaque grant for the chosen path, and hands
 * the renderer only the grant and a display name. The services host resolves
 * the grant itself when it lists or copies the source, so a renderer never
 * names a host path for an import, and a grant names exactly what the person
 * chose. A chosen folder is copied, never opened in place, so it is not
 * admitted as a root.
 */

import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { basename } from 'node:path';

/** One grant as the services host receives it. */
export type ImportGrant = Readonly<{ grant: string; path: string; kind: 'directory' | 'file' }>;

type ImportGrantsOptions = Readonly<{
  /** The most grants held at once; the oldest is let go first. */
  maxGrants: number;
  /** Tell the services host every grant it may resolve, in full, after each change. */
  publish: (grants: readonly ImportGrant[]) => void;
}>;

export type ImportGrants = Readonly<{
  /**
   * Mint a grant for a path a person chose.
   *
   * @param path - The chosen absolute path.
   * @param kind - Whether it is a folder or a file; anything else is refused.
   * @returns The grant and the name the import shows.
   */
  mint: (path: string, kind: ImportGrant['kind']) => Promise<Readonly<{ grant: string; name: string }>>;
  /** Every grant held now. */
  list: () => readonly ImportGrant[];
}>;

/**
 * Hold the grants for chosen import sources.
 *
 * @param options - The bound and the publisher.
 * @returns The grants.
 */
export const createImportGrants = (options: ImportGrantsOptions): ImportGrants => {
  const grants = new Map<string, ImportGrant>();
  return {
    async mint(path, kind) {
      const canonical = await realpath(path);
      const metadata = await stat(canonical);
      if (kind === 'directory' ? !metadata.isDirectory() : !metadata.isFile()) {
        throw new Error(`Tau can import only the ${kind === 'directory' ? 'folder' : 'file'} that was chosen.`);
      }
      const grant = randomUUID();
      grants.set(grant, { grant, path: canonical, kind });
      while (grants.size > options.maxGrants) {
        const [oldest] = grants.keys();
        grants.delete(oldest!);
      }
      options.publish([...grants.values()]);
      return { grant, name: basename(canonical) };
    },
    list: () => [...grants.values()],
  };
};
