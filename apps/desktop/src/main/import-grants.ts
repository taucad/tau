/**
 * Grants for sources a person chose to import (W7.4, charter D12, I6).
 *
 * Choosing a folder in the import picker, or opening a file with Tau, is the
 * admission event. Main mints an opaque grant for the chosen path, scoped to
 * the window it was chosen for, and hands that window only the grant and a
 * display name. The services host resolves the grant itself when it lists or
 * copies the source, and only for that window's filesystem connection, so a
 * renderer never names a host path for an import. A grant pins the chosen
 * entry by its device and inode, links resolved: the services host refuses it
 * once something else stands at that path. A grant is let go when its window
 * says the import is done, and every grant of a window when the window closes.
 * A chosen folder is copied, never opened in place, so it is not admitted as a
 * root.
 */

import { randomUUID } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { basename } from 'node:path';

/** One grant as the services host receives it. */
export type ImportGrant = Readonly<{
  grant: string;
  path: string;
  kind: 'directory' | 'file';
  /** The chosen entry's device and inode, as decimal strings. */
  identity: Readonly<{ dev: string; ino: string }>;
  /** The window (its `webContents` id) the grant was minted for, as a string. */
  owner: string;
}>;

/** Grants a window may hold beyond one full Open With batch: its folder pick and a batch still being let go. */
const grantHeadroom = 16;

/**
 * The per-window grant cap for an Open With limit of `maxOpenFiles`. One batch mints a grant per file for
 * one window, so a cap below the batch would evict that batch's own first grants before the window sees them.
 *
 * @returns The cap to pass as `maxGrants`.
 */
export const importGrantCapacity = (maxOpenFiles: number): number => maxOpenFiles + grantHeadroom;

type ImportGrantsOptions = Readonly<{
  /**
   * The most grants one window holds at once; its oldest is let go first.
   * Another window's grants never count against it, so one window minting
   * cannot evict a grant another window's import is using.
   */
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
   * @param owner - The window it was chosen for.
   * @returns The grant and the name the import shows.
   */
  mint: (path: string, kind: ImportGrant['kind'], owner: number) => Promise<Readonly<{ grant: string; name: string }>>;
  /** Let go of grants a window holds; another window's are left alone. */
  release: (grants: readonly string[], owner: number) => void;
  /** Let go of every grant a window holds, as it closes. */
  releaseOwner: (owner: number) => void;
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
  const publish = (): void => {
    options.publish([...grants.values()]);
  };
  return {
    async mint(path, kind, owner) {
      const canonical = await realpath(path);
      const metadata = await lstat(canonical, { bigint: true });
      if (kind === 'directory' ? !metadata.isDirectory() : !metadata.isFile()) {
        throw new Error(`Tau can import only the ${kind === 'directory' ? 'folder' : 'file'} that was chosen.`);
      }
      const grant = randomUUID();
      grants.set(grant, {
        grant,
        path: canonical,
        kind,
        identity: { dev: String(metadata.dev), ino: String(metadata.ino) },
        owner: String(owner),
      });
      const held = [...grants.values()].filter((entry) => entry.owner === String(owner));
      for (const evicted of held.slice(0, Math.max(0, held.length - options.maxGrants))) {
        grants.delete(evicted.grant);
      }
      publish();
      return { grant, name: basename(canonical) };
    },
    release(released, owner) {
      let changed = false;
      for (const grant of released) {
        if (grants.get(grant)?.owner === String(owner)) {
          grants.delete(grant);
          changed = true;
        }
      }
      if (changed) {
        publish();
      }
    },
    releaseOwner(owner) {
      const before = grants.size;
      for (const [grant, held] of grants) {
        if (held.owner === String(owner)) {
          grants.delete(grant);
        }
      }
      if (grants.size !== before) {
        publish();
      }
    },
    list: () => [...grants.values()],
  };
};
