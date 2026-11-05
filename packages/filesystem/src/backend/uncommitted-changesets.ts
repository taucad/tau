/**
 * The record of a create changeset that has not settled yet (charter I1, C8).
 *
 * A new file is written straight to its final path. Creating its handle makes
 * an empty file there before the writable opens, so a realm killed in between
 * leaves an empty file where the apply meant to put bytes. A batch therefore
 * records each create whose path it found missing under the path's exclusive
 * lock — never a path it was refused — with its expected size and the time,
 * and makes the file only once that record is kept, so no crash leaves an
 * empty file that no record names; it deletes the record once the batch
 * settles. The next initialise of the root undoes only that crash
 * shape: under the path's exclusive lock, a recorded file whose owner realm is
 * gone is removed when it is empty, was expected to hold bytes, and has not
 * been modified since the record was kept. Anything else — a file edited after
 * the crash, a person's file — is never touched.
 *
 * The records live in the IndexedDB database `tau-fs-uncommitted`, not in the
 * root, so they cost the root no write. W3's Project Index takes this database
 * over: its index records the expected size and oid of the last uncommitted
 * changeset, and this store goes away.
 *
 * @module
 */

import { randomUuid } from '@taucad/utils/id';

/** One path a create changeset created, and the size its bytes have. @public */
export type UncommittedEntry = Readonly<{ path: string; size: number }>;

/** One create changeset not yet settled, keyed by root, owner realm and changeset. @public */
export type UncommittedRecord = Readonly<{
  root: string;
  owner: string;
  changesetId: string;
  /** When the record was kept (`Date.now()`), after every entry's file was created. */
  recordedAt: number;
  entries: readonly UncommittedEntry[];
}>;

/** Where the records are kept. @public */
export type UncommittedChangesetStore = Readonly<{
  put: (record: UncommittedRecord) => Promise<void>;
  delete: (record: Pick<UncommittedRecord, 'root' | 'owner' | 'changesetId'>) => Promise<void>;
  list: (root: string) => Promise<UncommittedRecord[]>;
}>;

/** A crashed create's file was created before its record was kept; this covers clock granularity. */
export const uncommittedModifiedSlackMilliseconds = 2000;

const storeName = 'changesets';

const settle = async <Result>(request: IDBRequest<Result>): Promise<Result> =>
  new Promise((resolve, reject) => {
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('IndexedDB request failed.'));
    });
  });

const committed = async (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => {
      resolve();
    });
    transaction.addEventListener('error', () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    });
    transaction.addEventListener('abort', () => {
      reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    });
  });

/**
 * The IndexedDB store (database `tau-fs-uncommitted`, which W3's Project Index
 * takes over), or `undefined` where the realm has no IndexedDB.
 *
 * @param databaseName - The database to keep the records in.
 * @returns The store.
 * @public
 */
export const createIndexedDbUncommittedStore = (
  databaseName = 'tau-fs-uncommitted',
): UncommittedChangesetStore | undefined => {
  if (typeof indexedDB === 'undefined') {
    return undefined;
  }
  let opened: Promise<IDBDatabase> | undefined;
  const database = async (): Promise<IDBDatabase> => {
    opened ??= (async () => {
      const request = indexedDB.open(databaseName, 1);
      request.addEventListener('upgradeneeded', () => {
        const store = request.result.createObjectStore(storeName, { keyPath: ['root', 'owner', 'changesetId'] });
        store.createIndex('root', 'root');
      });
      return settle(request);
    })();
    try {
      return await opened;
    } catch (error) {
      opened = undefined;
      throw error;
    }
  };
  return {
    put: async (record) => {
      const connection = await database();
      const transaction = connection.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(record);
      await committed(transaction);
    },
    delete: async ({ root, owner, changesetId }) => {
      const connection = await database();
      const transaction = connection.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).delete([root, owner, changesetId]);
      await committed(transaction);
    },
    list: async (root) => {
      const connection = await database();
      const transaction = connection.transaction(storeName, 'readonly');
      return (await settle(transaction.objectStore(storeName).index('root').getAll(root))) as UncommittedRecord[];
    },
  };
};

/** Attempts a record delete gets before its failure is raised. */
const deleteAttempts = 3;

/**
 * Delete a record, retrying a failed delete, and raise the last failure.
 *
 * @param store - The store.
 * @param record - The record.
 * @throws When every attempt failed: a record left behind must never go unnoticed.
 * @public
 */
export const deleteUncommittedRecord = async (
  store: UncommittedChangesetStore,
  record: Pick<UncommittedRecord, 'root' | 'owner' | 'changesetId'>,
): Promise<void> => {
  let last: unknown;
  for (let attempt = 0; attempt < deleteAttempts; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- each attempt follows the one that failed.
      await store.delete(record);
      return;
    } catch (error) {
      last = error;
    }
  }
  throw new Error(`The uncommitted-changeset record ${record.changesetId} of ${record.root} could not be deleted.`, {
    cause: last,
  });
};

/** Web Lock a realm holds for its lifetime, so a sibling can tell its records and staging from a dead realm's. */
export const realmOwnerLockPrefix = 'tau-fs-staging-owner:';

/** This realm's owner id, one per worker: every provider in it shares the lock. */
export const realmOwnerId = randomUuid();
let realmOwnerHeld: Promise<void> | undefined;

/**
 * Hold this realm's owner lock for the realm's lifetime.
 *
 * @returns Resolves once the lock is held, or at once without Web Locks.
 * @public
 */
export const holdRealmOwner = async (): Promise<void> => {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) {
    return;
  }
  realmOwnerHeld ??= new Promise<void>((resolve) => {
    void navigator.locks.request(`${realmOwnerLockPrefix}${realmOwnerId}`, { mode: 'exclusive' }, async () => {
      resolve();
      await new Promise<never>(() => {
        // Held until the realm ends.
      });
    });
  });
  await realmOwnerHeld;
};

/**
 * The owner realms whose lock is held now. Read it after listing what they
 * own: an owner takes its lock before it records or stages anything.
 *
 * @returns Their ids, or `undefined` without Web Locks, where no owner can be told dead.
 * @public
 */
export const liveRealmOwners = async (): Promise<ReadonlySet<string> | undefined> => {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) {
    return undefined;
  }
  const snapshot = await navigator.locks.query();
  return new Set(
    (snapshot.held ?? []).flatMap(({ name }) =>
      name?.startsWith(realmOwnerLockPrefix) === true ? [name.slice(realmOwnerLockPrefix.length)] : [],
    ),
  );
};
