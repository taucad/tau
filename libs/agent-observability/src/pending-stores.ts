import type { Evidence } from '#contract.js';
import type { PendingEvidence, PendingEvidenceStore } from '#delivery.js';

/*
 * Durable pending stores for the evidence outbox (blueprint T09).
 *
 * Each holds at most what the outbox's bounds allow, keyed by immutable source
 * identity, in arrival order, and is purged by the outbox whenever its account,
 * project or grant changes. Neither is a second copy of the chat: it holds only
 * envelopes not yet answered, and drops each one on its receipt.
 */

const databaseVersion = 1;
const pendingStoreName = 'pending';
const keyIndexName = 'key';

type PendingRecord = PendingEvidence & Readonly<{ order?: number }>;

const settle = async <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    });
  });

const committed = async (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => {
      resolve();
    });
    transaction.addEventListener('abort', () => {
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
    transaction.addEventListener('error', () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    });
  });

/** Walk a store in key order; `visit` answers whether to continue. */
const walk = async (source: IDBObjectStore, visit: (cursor: IDBCursorWithValue) => boolean): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = source.openCursor();
    request.addEventListener('success', () => {
      const cursor = request.result;
      if (cursor === null || !visit(cursor)) {
        resolve();
        return;
      }
      cursor.continue();
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('IndexedDB cursor failed'));
    });
  });

/**
 * A pending store in the browser's IndexedDB, so a reload or a closed tab
 * does not lose envelopes that were never answered. Two tabs may share it:
 * a source is held once, and the API counts a replay once.
 *
 * @param name - The database name; one per host origin.
 * @param factory - The IndexedDB factory, injectable for tests.
 * @returns The store.
 * @public
 */
export const indexedDbPendingStore = (name: string, factory: IDBFactory = indexedDB): PendingEvidenceStore => {
  let opened: Promise<IDBDatabase> | undefined;
  const database = async (): Promise<IDBDatabase> => {
    opened ??= (async () => {
      const request = factory.open(name, databaseVersion);
      request.addEventListener('upgradeneeded', () => {
        const store = request.result.createObjectStore(pendingStoreName, { keyPath: 'order', autoIncrement: true });
        store.createIndex(keyIndexName, 'key', { unique: true });
      });
      return settle(request);
    })();
    return opened;
  };
  const transact = async <T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T>): Promise<T> => {
    const connection = await database();
    const transaction = connection.transaction(pendingStoreName, mode);
    const done = committed(transaction);
    const result = await work(transaction.objectStore(pendingStoreName));
    await done;
    return result;
  };

  return {
    async hold(item) {
      return transact('readwrite', async (store) => {
        const existing = await settle(store.index(keyIndexName).getKey(item.key));
        if (existing !== undefined) {
          return 'duplicate';
        }
        await settle(store.add({ key: item.key, evidence: item.evidence, bytes: item.bytes }));
        return 'held';
      });
    },
    async oldest(limit) {
      return transact('readonly', async (store) => {
        const items: PendingEvidence[] = [];
        await walk(store, (cursor) => {
          const record = cursor.value as PendingRecord;
          items.push({ key: record.key, evidence: record.evidence, bytes: record.bytes });
          return items.length < limit;
        });
        return items;
      });
    },
    async release(keys) {
      await transact('readwrite', async (store) => {
        const index = store.index(keyIndexName);
        const orders = await Promise.all(keys.map(async (key) => settle(index.getKey(key))));
        await Promise.all(
          orders.filter((order) => order !== undefined).map(async (order) => settle(store.delete(order))),
        );
      });
    },
    async purge(match) {
      return transact('readwrite', async (store) => {
        let purged = 0;
        await walk(store, (cursor) => {
          if (match((cursor.value as PendingRecord).evidence)) {
            cursor.delete();
            purged += 1;
          }
          return true;
        });
        return purged;
      });
    },
    async size() {
      return transact('readonly', async (store) => {
        let items = 0;
        let bytes = 0;
        await walk(store, (cursor) => {
          items += 1;
          bytes += (cursor.value as PendingRecord).bytes;
          return true;
        });
        return { items, bytes };
      });
    },
  };
};

/** The few file operations a Node host gives the file store. @public */
export type PendingFileSystem = Readonly<{
  readFile: (path: string) => Promise<string | undefined>;
  /** Replace the file's contents atomically, readable by its owner only. */
  replaceFile: (path: string, contents: string) => Promise<void>;
}>;

/** Wait for a change without inheriting its failure; its caller already saw it. */
const quietly = async (change: Promise<unknown>): Promise<void> => {
  try {
    await change;
  } catch {
    /* Reported to the caller of that change. */
  }
};

/**
 * A pending store in one owner-only file, for Node hosts (desktop services,
 * CLI serve, cloud hosts). The whole queue is bounded by the outbox, so each
 * change rewrites the file atomically; a crash leaves the old or the new
 * queue, never a torn one. Changes are serialised in this process.
 *
 * @param path - The queue file.
 * @param files - Atomic file access.
 * @returns The store.
 * @public
 */
export const filePendingStore = (path: string, files: PendingFileSystem): PendingEvidenceStore => {
  let loaded: Promise<PendingEvidence[]> | undefined;
  let queue: Promise<void> = Promise.resolve();

  const load = async (): Promise<PendingEvidence[]> => {
    loaded ??= (async () => {
      const contents = await files.readFile(path);
      if (contents === undefined) {
        return [];
      }
      try {
        const parsed: unknown = JSON.parse(contents);
        /* A file this version cannot read is dropped, not trusted: the API is the record. */
        return Array.isArray(parsed) ? (parsed as PendingEvidence[]) : [];
      } catch {
        return [];
      }
    })();
    return loaded;
  };

  /** Run one change after the previous one, then persist the queue it leaves. */
  const change = async <T>(work: (items: PendingEvidence[]) => T): Promise<T> => {
    const previous = queue;
    const next = (async () => {
      await previous;
      const items = await load();
      const result = work(items);
      await files.replaceFile(path, JSON.stringify(items));
      return result;
    })();
    queue = quietly(next);
    return next;
  };

  const read = async <T>(work: (items: readonly PendingEvidence[]) => T): Promise<T> => {
    await queue;
    return work(await load());
  };

  return {
    async hold(item) {
      return change<'held' | 'duplicate'>((items) => {
        if (items.some((held) => held.key === item.key)) {
          return 'duplicate';
        }
        items.push(item);
        return 'held';
      });
    },
    async oldest(limit) {
      return read((items) => items.slice(0, limit));
    },
    async release(keys) {
      const released = new Set(keys);
      await change((items) => {
        const kept = items.filter((item) => !released.has(item.key));
        items.splice(0, items.length, ...kept);
      });
    },
    async purge(match: (evidence: Evidence) => boolean) {
      return change((items) => {
        const kept = items.filter((item) => !match(item.evidence));
        const purged = items.length - kept.length;
        items.splice(0, items.length, ...kept);
        return purged;
      });
    },
    async size() {
      return read((items) => ({ items: items.length, bytes: items.reduce((total, item) => total + item.bytes, 0) }));
    },
  };
};
