/**
 * One resource per key, created on first use and shared by every caller (W6 RH-S4). It replaces the promise memos the
 * daemon and the desktop each kept for runtime clients, parameter actors and launchers.
 *
 * Every close evicts. A close removes the entry before it awaits the resource's own close, so a caller that arrives
 * meanwhile, or was still awaiting the closed entry's creation, gets a fresh incarnation. Each incarnation has a
 * token, and a close that names one reaches only that incarnation (I31). A creation that rejects leaves no entry, so
 * the next caller retries. A close that fails keeps the resource, and the key's next close, or `closeAll`, tries it
 * again. `closeAll` leaves no entry: a caller still awaiting a creation it closed is refused, not given a fresh one.
 */

/** A resource and the incarnation that made it. @public */
export type KeyedIncarnation<Value> = Readonly<{
  value: Value;
  /** Names this incarnation to {@link KeyedResource.close}; a later incarnation of the key has another. */
  incarnation: number;
}>;

/** A registry of resource handles by key. @public */
export type KeyedResource<Key, Value> = Readonly<{
  /** The key's live resource, created on first use; a resource that is no longer `alive` is replaced. */
  get: (key: Key) => Promise<Value>;
  /** As {@link KeyedResource.get}, with the incarnation's token, for a caller that closes only what it used. */
  acquire: (key: Key) => Promise<KeyedIncarnation<Value>>;
  /** Keys with an entry, including one still being created. */
  keys: () => Key[];
  /**
   * Remove the key's entry and close it. With `incarnation`, only when that is still the key's entry.
   *
   * @returns Once the close settled; rejects with the resource's close failure.
   */
  close: (key: Key, incarnation?: number) => Promise<void>;
  /**
   * Close every entry, and every resource whose close failed, and wait for every close already under way. A caller
   * awaiting a creation this closes is refused; a caller after it gets a fresh resource.
   */
  closeAll: () => Promise<void>;
}>;

type Entry<Value> = Readonly<{ incarnation: number; value: Promise<Value> }>;

/**
 * Build a {@link KeyedResource}.
 *
 * @param create - Make the resource for a key.
 * @param close - Release one resource.
 * @param alive - Whether a created resource can still serve; one that cannot is evicted without a close, since it
 * already ended itself. Defaults to always.
 * @returns The registry.
 * @public
 *
 * @example <caption>One runtime client per root</caption>
 * ```typescript
 * import { keyedResource } from '@taucad/host';
 *
 * declare const connect: (root: string) => Promise<{ terminate(): void; readonly lifecycleState: string }>;
 * const clients = keyedResource(connect, (client) => client.terminate(), (client) => client.lifecycleState !== 'terminated');
 * const { incarnation } = await clients.acquire('/project');
 * await clients.close('/project', incarnation);
 * ```
 */
export const keyedResource = <Key, Value>(
  create: (key: Key) => Promise<Value>,
  close: (value: Value, key: Key) => Promise<void> | void,
  alive: (value: Value) => boolean = () => true,
): KeyedResource<Key, Value> => {
  const entries = new Map<Key, Entry<Value>>();
  const closing = new Set<Promise<void>>();
  /* Resources whose close failed, by key: the key's next close, or `closeAll`, tries them again (K3). */
  const unclosed = new Map<Key, Value[]>();
  /* Entries `closeAll` closed: a caller awaiting one is refused rather than re-created (K4). */
  const fenced = new WeakSet<Entry<Value>>();
  let incarnations = 0;

  const refuseFenced = (current: Entry<Value>): void => {
    if (fenced.has(current)) {
      throw new Error('The resource was closed with every other one before it could be used.');
    }
  };

  const acquire = async (key: Key): Promise<KeyedIncarnation<Value>> => {
    for (;;) {
      let current = entries.get(key);
      if (current === undefined) {
        incarnations += 1;
        current = { incarnation: incarnations, value: create(key) };
        entries.set(key, current);
      }
      let value: Value;
      try {
        // oxlint-disable-next-line no-await-in-loop -- a closed or dead incarnation is replaced only after it is read.
        value = await current.value;
      } catch (error) {
        if (entries.get(key) !== current) {
          /* Closed while it was being created: the caller still wants the key, unless everything was closed. */
          refuseFenced(current);
          continue;
        }
        /* A creation that rejects leaves no entry, so the next caller retries. */
        entries.delete(key);
        throw error;
      }
      /* Closed (or replaced) while this call awaited it: never hand out a value that is being closed. */
      if (entries.get(key) !== current) {
        refuseFenced(current);
        continue;
      }
      if (alive(value)) {
        return { value, incarnation: current.incarnation };
      }
      entries.delete(key);
    }
  };

  const closeEntry = async (key: Key, incarnation?: number, fence = false): Promise<void> => {
    const found = entries.get(key);
    const current = incarnation === undefined || incarnation === found?.incarnation ? found : undefined;
    const left = unclosed.get(key) ?? [];
    unclosed.delete(key);
    if (current === undefined && left.length === 0) {
      return;
    }
    if (current !== undefined) {
      entries.delete(key);
      if (fence) {
        fenced.add(current);
      }
    }
    const closed = (async (): Promise<void> => {
      const values = [...left];
      try {
        if (current !== undefined) {
          values.push(await current.value);
        }
      } catch {
        /* A creation that failed has nothing to close. */
      }
      const failed: Value[] = [];
      const reasons: unknown[] = [];
      await Promise.all(
        values.map(async (value) => {
          try {
            await close(value, key);
          } catch (error) {
            failed.push(value);
            reasons.push(error);
          }
        }),
      );
      if (failed.length > 0) {
        unclosed.set(key, [...(unclosed.get(key) ?? []), ...failed]);
        throw reasons[0];
      }
    })();
    closing.add(closed);
    try {
      await closed;
    } finally {
      closing.delete(closed);
    }
  };

  return {
    get: async (key) => {
      const { value } = await acquire(key);
      return value;
    },
    acquire,
    keys: () => [...entries.keys()],
    close: closeEntry,
    closeAll: async () => {
      const underWay = [...closing];
      const keys = new Set([...entries.keys(), ...unclosed.keys()]);
      const outcomes = await Promise.allSettled([
        ...underWay,
        ...[...keys].map(async (key) => closeEntry(key, undefined, true)),
      ]);
      const failures = outcomes
        .filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected')
        .map((outcome): unknown => outcome.reason);
      const [only] = failures;
      if (failures.length === 1 && only instanceof Error) {
        throw only;
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Some resources could not be closed.');
      }
    },
  };
};
