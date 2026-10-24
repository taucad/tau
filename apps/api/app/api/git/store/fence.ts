import { RepositoryStoreError } from '#api/git/store/errors.js';
import { writeSpilledPushLog } from '#api/git/store/commit.js';
import { decodeManifest, encodeManifest, isTombstoned, succeedManifest } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import { migrationFenceCommitter } from '#api/git/store/fence-marker.js';
import type { CommitToken, RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';

/* The marker (`isFenceManifest`, `migrationFenceCommitter`) lives in
   `fence-marker.ts` (DC1), so tau-api can recognise a fence without importing
   the committer that writes one. */

/**
 * Commits a fence: one conditional manifest write with the same refs and
 * packs and `committedBy: 'migration-fence'` (W10 cut-over step 3).
 *
 * A push that hydrated its lease before the freeze holds the token this write
 * replaces, so its own conditional write loses and is answered as a lost race
 * like any other — whatever the route cache on its API Machine said (north
 * star risk row, FR13). Nothing acknowledged before the freeze is affected,
 * and no straggler can land after the final delta.
 *
 * A repository with no manifest is fenced too, with an empty generation 1:
 * otherwise a first push admitted before the freeze would create one with
 * `If-None-Match` after it. A tombstoned repository is refused rather than
 * fenced, because a successor without the tombstone would resurrect it, and a
 * migration skips tombstoned repositories anyway (W10 inventory).
 *
 * @param args - The store and the repository; `at` is injectable for tests.
 * @returns The fence manifest and its token.
 * @throws RepositoryStoreError `tombstoned` for a tombstoned repository, `lost` when another
 *   writer committed between this read and this write (the caller reads again and retries).
 */
export const commitFence = async (args: {
  store: RepositoryStore;
  locator: RepositoryLocator;
  at?: Date;
}): Promise<{ manifest: Manifest; token: CommitToken }> => {
  const { store, locator } = args;
  const read = await store.readManifest(locator);
  const current = read === undefined ? undefined : decodeManifest(read.manifest);
  if (isTombstoned(current)) {
    throw new RepositoryStoreError('tombstoned', `repository ${locator.projectId} is tombstoned and is not fenced`);
  }

  const next = succeedManifest(
    current,
    {
      refs: current?.refs ?? {},
      packs: current?.packs ?? [],
      committedBy: migrationFenceCommitter,
    },
    args.at,
  );
  await writeSpilledPushLog({ store, locator, base: current, next });
  const bytes = encodeManifest(next);
  let token: CommitToken | 'lost';
  try {
    token = await store.commitManifest(locator, bytes, read?.token ?? 'absent');
  } catch (error) {
    /* A transport error may still have landed the write: reconcile by bytes, as a push does. */
    token = (await landed(store, locator, bytes)) ?? 'lost';
    if (token === 'lost') {
      throw new RepositoryStoreError('lost', `the fence on ${locator.projectId} did not certainly land`, {
        cause: error,
      });
    }
  }
  if (token === 'lost') {
    token = (await landed(store, locator, bytes)) ?? 'lost';
  }
  if (token === 'lost') {
    throw new RepositoryStoreError('lost', `another writer changed ${locator.projectId} before the fence`);
  }
  return { manifest: next, token };
};

/** The token of the stored manifest when it holds exactly `bytes`, which means this writer's write landed. */
const landed = async (
  store: RepositoryStore,
  locator: RepositoryLocator,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<CommitToken | undefined> => {
  const read = await store.readManifest(locator);
  return read !== undefined && Buffer.from(read.manifest).equals(Buffer.from(bytes)) ? read.token : undefined;
};
