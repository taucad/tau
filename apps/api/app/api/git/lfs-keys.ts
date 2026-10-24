import type { ObjectStorageService, StorageTier } from '#storage/object-storage.service.js';
import type { StorageNamespace } from '#storage/storage.constants.js';
import { gitLfsObjectKey } from '#api/git/git.constants.js';
import { repositoryLocator } from '#api/git/store/locator.js';

/**
 * Where an LFS object's bytes live, and how they get there — the whole of the
 * D24 key layout as plain functions.
 *
 * Deliberately free of any Nest service: the batch endpoint, the retirement
 * pass and the publication materializer all need this answer, and when it lived
 * beside `GitLfsService` the materializer's import closed a cycle through
 * `git.service.ts`. Nothing here may import a service again.
 */

/**
 * Where one large object lives under its owner's tenant prefix (D24), which is
 * what makes purging an account one prefix and moving one to other storage one
 * locator change. The project stays in the key: the reservation, the quota it
 * is counted against and the retirement that deletes it are all per project,
 * and two projects of one owner holding the same `oid` must not share bytes
 * that either of them may retire.
 *
 * Both ids go through `repositoryLocator`, which is where NI14/NI15 put the
 * check: they land verbatim in an object key, so a separator or a traversal is
 * refused here rather than at each call site, and no key can leave its tenant
 * prefix.
 *
 * @param ownerId - The account whose storage holds the object.
 * @param projectId - The project that reserved it.
 * @param oid - git-lfs's own SHA-256 object identity.
 * @returns The key, relative to the `tenants` namespace.
 * @throws RangeError - When either id is not a storable identifier.
 */
export const tenantLfsObjectKey = (ownerId: string, projectId: string, oid: string): string => {
  const locator = repositoryLocator({ ownerId, projectId });
  return `${locator.ownerId}/lfs/${locator.projectId}/${oid}`;
};

/** A place LFS bytes may be, in the private tier. */
export type LfsObjectLocation = {
  readonly namespace: StorageNamespace;
  readonly key: string;
  readonly tier: StorageTier;
};

/**
 * Where a read looks, in order: the tenant key every upload now lands at, then
 * the pre-D24 per-project key under `blobs/`. The fallback is what keeps data
 * written before the move readable until `relocateLegacyLfsObjects`
 * (`maintenance/lfs-relocation.ts`) has run for that project (W9's handbook step).
 *
 * @param ownerId - The account whose storage holds the object.
 * @param projectId - The project that reserved it.
 * @param oid - git-lfs's own SHA-256 object identity.
 * @returns The tenant location first, the legacy location second.
 */
export const lfsObjectLocations = (
  ownerId: string,
  projectId: string,
  oid: string,
): readonly [LfsObjectLocation, LfsObjectLocation] => [
  { namespace: 'tenants', key: tenantLfsObjectKey(ownerId, projectId, oid), tier: 'private' },
  { namespace: 'blobs', key: gitLfsObjectKey(projectId, oid), tier: 'private' },
];

/**
 * Where this project's bytes for `oid` actually are, or `undefined`.
 *
 * The tenant key first, then the legacy one: every upload since D24 lands under
 * the tenant prefix, and a project whose objects predate the move is still
 * served from where its bytes are until the handbook relocates them. Every
 * reader of an LFS object goes through this — the batch endpoint, `verify`, and
 * the publication materializer — so there is one answer to "where are the
 * bytes" rather than one per caller.
 *
 * @param storage - The object-storage driver to read through.
 * @param args - The owner, the project and git-lfs's object identity.
 * @returns The location holding the bytes and their stored length, or `undefined`.
 */
export const resolveLfsObjectLocation = async (
  storage: ObjectStorageService,
  args: { readonly ownerId: string; readonly projectId: string; readonly oid: string; readonly signal?: AbortSignal },
): Promise<{ location: LfsObjectLocation; size: number; etag: string } | undefined> => {
  for (const location of lfsObjectLocations(args.ownerId, args.projectId, args.oid)) {
    // oxlint-disable-next-line no-await-in-loop -- the legacy key is only read when the tenant key misses
    const stored = await storage.headBlob(args.signal === undefined ? location : { ...location, signal: args.signal });
    if (stored !== undefined) {
      return { location, size: stored.size, etag: stored.etag };
    }
  }
  return undefined;
};
