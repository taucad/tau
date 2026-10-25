import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { chmod, link, mkdir, rename, rm, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';

/**
 * The pack cache of tau-storage (Hosted Remote Storage DC2; north star "pack cache
 * (immutable keys, LRU, budget from statfs, single-flight, disposable)").
 *
 * A lease hydrate is one manifest read and one read per pack and index. Every
 * pack key names immutable bytes (`pack-<hash>-<nonce>.pack`, never rewritten
 * under its key), so a worker keeps the files it has read and hard-links them
 * into the next lease of the same repository instead of reading them again:
 *
 * - **Keyed by the full locator** (owner, project, pack key; review FR8), so two
 *   tenants' packs that share a basename never meet.
 * - **Read-only** (mode 0444; FR18). A hard link shares the inode, so a write
 *   through one lease would change what every later lease reads. Git never
 *   writes into a pack it did not create, and the push-then-fetch storm test
 *   holds that for this build's git.
 * - **Only what the manifest lists.** A lease asks for the keys of the manifest
 *   it just read and nothing else, so a cached pack the manifest has since
 *   retired cannot reach it.
 * - **Pinned while linked.** A lease holds each entry it linked until it is
 *   disposed; eviction skips pinned entries, so the cache's accounting never
 *   loses bytes a live lease still holds through its link.
 * - **Budgeted LRU.** The budget is read on every fill from the caller (a
 *   fraction of the lease filesystem, from `statfs`); the least recently used
 *   unpinned entries go first.
 * - **Single-flight.** Concurrent misses on one key share one store read.
 * - **Disposable.** Nothing here is durable state. A wiped directory is a miss
 *   (a failed link drops the entry and refills it once), and a lease the cache
 *   cannot serve is hydrated straight from the store, as before DC2.
 */

/** What the cache reports, for the `tau.git.cache.*` series (W14 OB4). */
export type PackCacheEvents = {
  /** One object looked up for a lease. */
  lookup(result: 'hit' | 'miss'): void;
  /** One entry evicted, with its bytes. */
  evicted(bytes: number): void;
  /** One lease hydrated straight from the store: larger than the budget, or the cache failed it. */
  fallback(reason: 'over_budget' | 'cache_error'): void;
  /** Bytes held now, pinned by a lease or idle, and the budget last read. */
  occupancy(state: { readonly pinnedBytes: number; readonly idleBytes: number; readonly budgetBytes: number }): void;
};

/** One file the cache holds. */
type Entry = {
  readonly id: string;
  readonly file: string;
  readonly bytes: number;
  /** Leases holding a link to it now. */
  pins: number;
};

/** A lease's hold on the entries it linked; released when the lease is disposed. */
export type PackCacheHold = {
  /** Whether the object was already cached. */
  readonly hit: boolean;
  /** Gives the entry back to eviction. Idempotent. */
  release(): void;
  /**
   * Gives the entry back and forgets it, removing the cached file: what a lease
   * whose hydrate failed does, so bytes that may be what failed it are read
   * again by the next lease. Idempotent, and a no-op after `release`.
   */
  discard(): Promise<void>;
};

/** A filled object whose size is not what the manifest records: a short read, never cached. */
export class PackCacheSizeError extends Error {
  public constructor(key: string, expected: number, actual: number) {
    super(`read ${String(actual)} bytes of ${key}, the manifest records ${String(expected)}`);
    this.name = 'PackCacheSizeError';
  }
}

/** `ENOENT`, which is what a wiped cache directory answers a link or a rename with. */
const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';

export class PackCache {
  readonly #root: string;
  readonly #budgetBytes: () => Promise<number>;
  readonly #events: PackCacheEvents | undefined;
  /** Insertion order is recency: a hit moves its entry to the end. */
  readonly #entries = new Map<string, Entry>();
  readonly #filling = new Map<string, Promise<Entry>>();
  #bytes = 0;
  #budget = 0;

  /**
   * @param options - Where the cache lives (on the lease filesystem, so a hard link works), how large it may
   *   grow now, and where its events go.
   */
  public constructor(options: {
    readonly root: string;
    readonly budgetBytes: () => Promise<number>;
    readonly events?: PackCacheEvents;
  }) {
    this.#root = options.root;
    this.#budgetBytes = options.budgetBytes;
    this.#events = options.events;
  }

  /** The cache directory. */
  public get root(): string {
    return this.#root;
  }

  /** Bytes the cache holds now. */
  public get bytes(): number {
    return this.#bytes;
  }

  /** Bytes eviction could give back now: every entry no lease holds. */
  public get evictableBytes(): number {
    let total = 0;
    for (const entry of this.#entries.values()) {
      if (entry.pins === 0) {
        total += entry.bytes;
      }
    }
    return total;
  }

  /**
   * The budget, read now: what a lease's packs are compared against before it
   * is offered the cache at all. A repository larger than this is hydrated
   * straight from the store (the full-hydrate fallback).
   *
   * @returns Bytes the cache may hold.
   */
  public async budget(): Promise<number> {
    this.#budget = Math.max(0, Math.floor(await this.#budgetBytes()));
    return this.#budget;
  }

  /**
   * Hard-links one stored object into a lease, reading it from the store only
   * on a miss.
   *
   * @param args - The store and repository, the object's key, the path in the lease it is linked to, and the
   *   object's size when the manifest records it (a pack's), which a fill must match before it is cached.
   * @returns The hold, which the lease releases when it is disposed.
   * @throws Whatever the store raised on a miss (a `missing-pack` stays one), a {@link PackCacheSizeError},
   *   or a filesystem error: the caller answers the last two by reading the object straight from the store.
   */
  public async acquire(args: {
    readonly store: RepositoryStore;
    readonly locator: RepositoryLocator;
    readonly key: string;
    readonly destination: string;
    readonly expectedBytes?: number;
  }): Promise<PackCacheHold> {
    const id = `${args.locator.ownerId}/${args.locator.projectId}/${args.key}`;
    /* Twice at most: a link that finds the file gone (the directory was wiped)
       drops the entry and fills it again once. */
    for (let attempt = 0; ; attempt += 1) {
      const cached = this.#entries.get(id);
      // oxlint-disable-next-line no-await-in-loop -- the second pass exists only because the first link failed
      const entry = cached ?? (await this.#fill(id, args));
      entry.pins += 1;
      try {
        // oxlint-disable-next-line no-await-in-loop -- as above
        await link(entry.file, args.destination);
      } catch (error) {
        entry.pins -= 1;
        if (!isMissing(error) || attempt > 0) {
          throw error;
        }
        this.#drop(entry);
        continue;
      }
      if (cached !== undefined) {
        this.#entries.delete(id);
        this.#entries.set(id, entry);
      }
      this.#events?.lookup(cached === undefined ? 'miss' : 'hit');
      let released = false;
      const giveBack = (): boolean => {
        if (released) {
          return false;
        }
        released = true;
        entry.pins -= 1;
        return true;
      };
      const hold: PackCacheHold = {
        hit: cached !== undefined,
        release: () => {
          if (giveBack()) {
            this.#report();
          }
        },
        discard: async () => {
          if (!giveBack()) {
            return;
          }
          if (this.#entries.get(entry.id) === entry) {
            /* Another lease's link keeps its bytes; only the cache forgets them. */
            await this.#remove(entry);
          }
          this.#report();
        },
      };
      if (cached === undefined) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- one fill's eviction, after the entry is pinned
          await this.#evict(this.#budget);
        } catch {
          /* The object is linked and the hold is the lease's whatever eviction
             did: the next fill evicts again, and an entry this one failed to
             unlink was already forgotten. */
          this.#report();
        }
      } else {
        this.#report();
      }
      return hold;
    }
  }

  /**
   * Evicts idle entries, least recently used first, until `readFreeBytes`
   * reports at least `neededBytes`, or nothing idle is left. Admission calls it
   * after admitting a lease it counted the cache's idle bytes towards (DA3).
   *
   * @param neededBytes - The free bytes the lease filesystem must have.
   * @param readFreeBytes - The filesystem's free bytes now (`statfs`).
   */
  public async reclaim(neededBytes: number, readFreeBytes: () => Promise<number>): Promise<void> {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- each eviction changes what statfs reads next
      if ((await readFreeBytes()) >= neededBytes) {
        return;
      }
      const idle = [...this.#entries.values()].find((entry) => entry.pins === 0);
      if (idle === undefined) {
        return;
      }
      // oxlint-disable-next-line no-await-in-loop -- one unlink at a time, then statfs again
      await this.#remove(idle);
    }
  }

  /**
   * Records a lease the cache did not serve.
   *
   * @param reason - Its packs exceed the budget, or the cache failed while linking them.
   */
  public recordFallback(reason: 'over_budget' | 'cache_error'): void {
    this.#events?.fallback(reason);
  }

  /** Forgets every entry and removes the directory: what a boot or a test does. */
  public async clear(): Promise<void> {
    this.#entries.clear();
    this.#bytes = 0;
    await rm(this.#root, { recursive: true, force: true });
    this.#report();
  }

  /** Reads one object into the cache, once however many leases miss on it together. */
  async #fill(
    id: string,
    args: {
      readonly store: RepositoryStore;
      readonly locator: RepositoryLocator;
      readonly key: string;
      readonly expectedBytes?: number;
    },
  ): Promise<Entry> {
    const running = this.#filling.get(id);
    if (running !== undefined) {
      return running;
    }
    const filling = (async (): Promise<Entry> => {
      /* The tenant directory is a digest of owner and project, so no id can
         name a path outside the cache whatever it holds. */
      const tenant = createHash('sha256').update(`${args.locator.ownerId}\0${args.locator.projectId}`).digest('hex');
      const directory = path.join(this.#root, tenant.slice(0, 32));
      const file = path.join(directory, path.posix.basename(args.key));
      const incoming = path.join(this.#root, '.incoming');
      const partial = path.join(incoming, randomBytes(12).toString('hex'));
      await mkdir(directory, { recursive: true });
      await mkdir(incoming, { recursive: true });
      try {
        await pipeline(await args.store.getObject(args.locator, args.key), createWriteStream(partial, { mode: 0o444 }));
        await chmod(partial, 0o444);
        /* A short or long read is not the object the manifest names: it must
           never become an entry every later lease links. */
        const { size: filled } = await stat(partial);
        if (args.expectedBytes !== undefined && filled !== args.expectedBytes) {
          throw new PackCacheSizeError(args.key, args.expectedBytes, filled);
        }
        await rename(partial, file);
      } catch (error) {
        await rm(partial, { force: true });
        throw error;
      }
      const { size } = await stat(file);
      const entry: Entry = { id, file, bytes: size, pins: 0 };
      this.#entries.set(id, entry);
      this.#bytes += size;
      return entry;
    })();
    this.#filling.set(id, filling);
    try {
      return await filling;
    } finally {
      this.#filling.delete(id);
    }
  }

  /** Evicts idle entries, oldest first, until the cache is within `budget`. */
  async #evict(budget: number): Promise<void> {
    /* A Map visits entries in insertion order and skips the ones deleted on the way. */
    for (const entry of this.#entries.values()) {
      if (this.#bytes <= budget) {
        break;
      }
      if (entry.pins === 0) {
        // oxlint-disable-next-line no-await-in-loop -- one unlink at a time keeps the accounting exact
        await this.#remove(entry);
      }
    }
    this.#report();
  }

  async #remove(entry: Entry): Promise<void> {
    this.#drop(entry);
    try {
      await unlink(entry.file);
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
    }
    this.#events?.evicted(entry.bytes);
  }

  /** Forgets an entry without touching its file. */
  #drop(entry: Entry): void {
    if (this.#entries.get(entry.id) === entry) {
      this.#entries.delete(entry.id);
      this.#bytes -= entry.bytes;
    }
  }

  #report(): void {
    const idleBytes = this.evictableBytes;
    this.#events?.occupancy({ pinnedBytes: this.#bytes - idleBytes, idleBytes, budgetBytes: this.#budget });
  }
}
