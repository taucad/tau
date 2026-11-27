/**
 * The worker's stop on writing caches (progressive loading PL7, FP5): once a page in safe mode asks, the worker that
 * controls it writes no cache for the rest of its life, so the sweep the page makes next is the last word. A worker is
 * stopped and restarted while it still controls pages, so the stop is kept in IndexedDB, not only in memory; a newly
 * installed worker clears it.
 *
 * Deterministic: {@link CachingStop.stop} settles only after every write already under way has finished, and every
 * write starts by checking {@link CachingStop.isStopped} after {@link CachingStop.ready}, so nothing is written after
 * the page's acknowledgement, whatever the timing.
 */

/** The IndexedDB database the stop is kept in. Not Cache Storage: the page's sweep deletes the worker's caches. */
export const cachingStopDatabase = 'tau-service-worker-stop';
const storeName = 'state';
const stoppedKey = 'stopped';

/** The worker's stop. */
export type CachingStop = Readonly<{
  /** Settles once the stored stop has been read at the worker's start. */
  ready: Promise<void>;
  /** Whether this worker writes no cache. Read after {@link ready} for a stop an earlier start of it stored. */
  isStopped: () => boolean;
  /** Stop for good: stored, and settled once every write under way has finished. */
  stop: () => Promise<void>;
  /** A new worker's install: forget a stop an earlier worker stored. */
  clear: () => Promise<void>;
  /** Run a cache write, unless stopped; {@link stop} waits for it. */
  write: (run: () => Promise<void>) => Promise<void>;
}>;

const openDatabase = async (factory: IDBFactory): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = factory.open(cachingStopDatabase, 1);
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore(storeName);
    });
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('IndexedDB refused'));
    });
  });

const run = async <T>(
  factory: IDBFactory,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const database = await openDatabase(factory);
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = operation(database.transaction(storeName, mode).objectStore(storeName));
      request.addEventListener('success', () => {
        resolve(request.result);
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error('IndexedDB refused'));
      });
    });
  } finally {
    database.close();
  }
};

/**
 * The stop for one worker start.
 *
 * @param factory - The worker's IndexedDB factory; without one the stop lasts only this start.
 * @returns The stop.
 */
export const createCachingStop = (factory: IDBFactory | undefined): CachingStop => {
  let stopped = false;
  const writes = new Set<Promise<void>>();
  const ready = (async (): Promise<void> => {
    try {
      if (factory !== undefined && (await run(factory, 'readonly', (store) => store.get(stoppedKey))) === true) {
        stopped = true;
      }
    } catch {
      // Unreadable: this start writes as usual until a page stops it.
    }
  })();
  return {
    ready,
    isStopped: () => stopped,
    stop: async () => {
      stopped = true;
      try {
        if (factory !== undefined) {
          await run(factory, 'readwrite', (store) => store.put(true, stoppedKey));
        }
      } catch {
        // Unstorable: the stop holds for this start, which is all a page that cannot store it can ask for.
      }
      await Promise.allSettled(writes);
    },
    clear: async () => {
      await ready;
      stopped = false;
      try {
        if (factory !== undefined) {
          await run(factory, 'readwrite', (store) => store.delete(stoppedKey));
        }
      } catch {
        // Nothing stored to clear.
      }
    },
    write: async (write) => {
      await ready;
      if (stopped) {
        return;
      }
      const pending = write();
      writes.add(pending);
      try {
        await pending;
      } finally {
        writes.delete(pending);
      }
    },
  };
};
