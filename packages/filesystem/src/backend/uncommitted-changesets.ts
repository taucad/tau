/**
 * The record of a create changeset that has not settled yet (charter I1, C8).
 *
 * A new file is written straight to its final path, so a realm killed while
 * the write is open can leave that path empty or short. Before a batch's
 * creates write anything the provider records each path with its expected
 * size (and git blob oid where the caller knows one); once the batch settles it
 * deletes the record. The next initialise of the root verifies every entry of
 * a record whose owner realm is gone, by metadata alone, and removes a file
 * that does not match, so the path reads absent and the apply or large-object
 * fill writes it again.
 *
 * The record lives in IndexedDB, not in the root, so it costs the root no
 * write. W3's Project Index takes the record over; until then it is this
 * small store.
 *
 * @module
 */

/** One path a create changeset writes, and what it must hold once written. @public */
export type UncommittedEntry = Readonly<{ path: string; size: number; oid?: string }>;

/** One create changeset not yet settled, keyed by root, owner realm and changeset. @public */
export type UncommittedRecord = Readonly<{
  root: string;
  owner: string;
  changesetId: string;
  entries: readonly UncommittedEntry[];
}>;

/** Where the records are kept. @public */
export type UncommittedChangesetStore = Readonly<{
  put: (record: UncommittedRecord) => Promise<void>;
  delete: (record: Pick<UncommittedRecord, 'root' | 'owner' | 'changesetId'>) => Promise<void>;
  list: (root: string) => Promise<UncommittedRecord[]>;
}>;

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
 * The IndexedDB store, or `undefined` where the realm has no IndexedDB.
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

/** The largest file whose oid a verification hashes; a larger one is checked by size alone. */
export const uncommittedOidLimitBytes = 1024 * 1024;

/**
 * The git blob oid (SHA-1 over `blob <size>\0` and the bytes) of `bytes`.
 *
 * @param bytes - The file's bytes.
 * @returns The lowercase hex oid.
 * @public
 */
export const gitBlobOid = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> => {
  const header = new TextEncoder().encode(`blob ${String(bytes.byteLength)}\0`);
  const framed = new Uint8Array(header.byteLength + bytes.byteLength);
  framed.set(header);
  framed.set(bytes, header.byteLength);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', framed));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
