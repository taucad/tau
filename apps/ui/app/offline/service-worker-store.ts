/**
 * What the web app's service worker holds, and how it fills its caches (progressive loading PL7; FP1 of Brain
 * `research/pl7-service-worker-staging-defects-blueprint.md`). `service-worker.ts` binds these to the worker global;
 * here they take their I/O as arguments, so they are unit-tested without a worker.
 *
 * The rule: the worker answers a request only from a cache entry it knows it holds, and never re-issues a request on the
 * page's behalf. A request the worker makes is not the page's: it has no destination, and a content blocker or a policy
 * keyed on request type may refuse it where the page's own would pass (Finding 2). So:
 *
 * - **An in-memory index** of every stored response, loaded when the worker starts, decides synchronously whether a
 *   subresource is answered at all ({@link subresourceKey}). A miss gets no answer: the browser keeps the request its
 *   own.
 * - **Install never fails on an entry** ({@link installPrecache}): it stores what it can fetch and reports the rest, so a
 *   successor always installs (D2, D16). A class's document is served from the cache only while its whole closure is
 *   stored ({@link completeDocuments}).
 * - **Cache on first use is a copy from the HTTP cache** ({@link fillFromHttpCache}): after the page's own request,
 *   `cache: 'only-if-cached'`, so it adds no download and no request a blocker could see. Its failure is ignored.
 * - **The build floor** a page handed the worker is kept in a cache of its own ({@link storeBuildFloor}), so a worker
 *   started later knows it without the network (FP2).
 */
import { isQuotaError } from '#offline/service-worker-routing.js';

/** A cache as the store uses it. */
export type StoreCache = Pick<Cache, 'keys' | 'match' | 'put' | 'delete'>;

/** One precache entry: its URL, the key it is stored under, and whether it carries a revision (a document). */
export type PrecacheItem = Readonly<{ url: string; cacheKey: string; revisioned: boolean }>;

/** How an install ended: entries stored now or already, and those that could not be fetched or stored. */
export type InstallReport = Readonly<{
  stored: readonly string[];
  failed: ReadonlyArray<Readonly<{ url: string; reason: string }>>;
  /** Whether a write hit the storage quota. */
  quotaExceeded: boolean;
}>;

const describe = (error: unknown): string => {
  const message = typeof error === 'object' && error !== null ? (error as { message?: unknown }).message : error;
  return typeof message === 'string' ? message : 'unknown error';
};

/**
 * The URLs of every response the given caches hold.
 *
 * @param caches - The caches.
 * @returns Each stored request's URL.
 */
export const readStoredUrls = async (caches: readonly StoreCache[]): Promise<Set<string>> => {
  const lists = await Promise.all(caches.map(async (cache) => cache.keys()));
  return new Set(lists.flat().map((request) => request.url));
};

/**
 * Install the precache: fetch and store every entry not already stored under its key, without ever failing on one.
 *
 * Documents (revisioned) bypass the HTTP cache; hashed files may come from it. No credentials: a hashed file asked for
 * with another deploy's skew protection cookie would be answered by that deploy, which may not have it.
 *
 * @param input - The entries, what is already stored, the network, and the precache.
 * @returns What was stored and what failed. Never rejects.
 */
export const installPrecache = async (
  input: Readonly<{
    items: readonly PrecacheItem[];
    stored: ReadonlySet<string>;
    fetchFile: (request: Request) => Promise<Response>;
    cache: Pick<StoreCache, 'put'>;
    origin: string;
  }>,
): Promise<InstallReport> => {
  let quotaExceeded = false;
  const outcomes = await Promise.all(
    input.items.map(async (item): Promise<Readonly<{ url: string; key?: string; reason?: string }>> => {
      if (input.stored.has(item.cacheKey)) {
        return { url: item.url, key: item.cacheKey };
      }
      try {
        const response = await input.fetchFile(
          new Request(new URL(item.url, input.origin), {
            credentials: 'omit',
            cache: item.revisioned ? 'reload' : 'default',
          }),
        );
        if (response.status !== 200 || response.redirected) {
          return { url: item.url, reason: `answered ${String(response.status)}` };
        }
        await input.cache.put(item.cacheKey, response);
        return { url: item.url, key: item.cacheKey };
      } catch (error) {
        quotaExceeded ||= isQuotaError(error);
        return { url: item.url, reason: describe(error) };
      }
    }),
  );
  return {
    stored: outcomes.flatMap((outcome) => (outcome.key === undefined ? [] : [outcome.key])),
    failed: outcomes.flatMap((outcome) =>
      outcome.reason === undefined ? [] : [{ url: outcome.url, reason: outcome.reason }],
    ),
    quotaExceeded,
  };
};

/**
 * The documents the worker may serve from its cache: those whose whole closure (the document and every file its class
 * needs to boot, `scripts/build-service-worker.ts`) is stored.
 *
 * @param classes - Each document's closure, by URL.
 * @param cacheKeyFor - A precache URL's cache key, or `undefined` when not in this worker's list.
 * @param stored - The index.
 * @returns The complete documents.
 */
export const completeDocuments = (
  classes: Readonly<Record<string, readonly string[]>>,
  cacheKeyFor: (url: string) => string | undefined,
  stored: ReadonlySet<string>,
): Set<string> =>
  new Set(
    Object.entries(classes)
      .filter(([document, closure]) =>
        [document, ...closure].every((url) => {
          const key = cacheKeyFor(url);
          return key !== undefined && stored.has(key);
        }),
      )
      .map(([document]) => document),
  );

/** Where a stored response for a subresource is: the cache name and the key it is stored under. */
export type StoredLocation = Readonly<{ cacheName: string; key: string }>;

/**
 * Where the worker holds a response for a subresource, decided synchronously from the index. A miss is `undefined`, and
 * the worker then leaves the request to the browser.
 *
 * A hashed file stored in the precache by another version of the worker (the precache is shared until activation
 * deletes the previous version's entries) is answered from there too: its URL names its bytes.
 *
 * @param input - The request's URL, the precache key lookup, what each cache holds, and the two cache names.
 * @returns The stored location, or `undefined`.
 */
export const subresourceKey = (
  input: Readonly<{
    url: string;
    cacheKeyFor: (url: string) => string | undefined;
    precached: ReadonlySet<string>;
    assets: ReadonlySet<string>;
    precacheName: string;
    assetCacheName: string;
  }>,
): StoredLocation | undefined => {
  const key = input.cacheKeyFor(input.url) ?? input.url;
  if (input.precached.has(key)) {
    return { cacheName: input.precacheName, key };
  }
  if (input.assets.has(input.url)) {
    return { cacheName: input.assetCacheName, key: input.url };
  }
  return undefined;
};

/** Milliseconds after a miss at which the fill looks in the HTTP cache: once the page's own load has likely finished. */
export const fillDelays: readonly number[] = [2000, 10_000, 30_000];

/**
 * Copy a file the page loaded from the HTTP cache into the worker's asset cache, for offline use: no download, and no
 * request a content blocker could refuse, since `only-if-cached` never reaches the network. Waits for the page's own
 * request first, trying again at each of {@link fillDelays}. Any failure leaves the file uncached until its next miss.
 *
 * @param input - The URL, the network (`fetch`), the asset cache, a timer, and what to do once stored or on a quota
 *   error.
 * @returns Whether the file was stored. Never rejects.
 */
export const fillFromHttpCache = async (
  input: Readonly<{
    url: string;
    fetchFile: (url: string, init: RequestInit) => Promise<Response>;
    cache: Pick<StoreCache, 'put'>;
    wait: (milliseconds: number) => Promise<void>;
    onStored: (url: string) => Promise<void>;
    /** The origin's storage quota refused the write: the asset cache is purged, as Workbox's `purgeOnQuotaError` did. */
    onQuotaExceeded: () => Promise<void>;
    delays?: readonly number[];
  }>,
): Promise<boolean> => {
  let waited = 0;
  for (const attemptDelay of input.delays ?? fillDelays) {
    // oxlint-disable-next-line no-await-in-loop -- Each attempt waits for the page's own load, in turn.
    await input.wait(attemptDelay - waited);
    waited = attemptDelay;
    try {
      // oxlint-disable-next-line no-await-in-loop -- Each attempt waits for the page's own load, in turn.
      const response = await input.fetchFile(input.url, {
        cache: 'only-if-cached',
        mode: 'same-origin',
        credentials: 'same-origin',
      });
      if (response.status === 200) {
        // oxlint-disable-next-line no-await-in-loop -- Stops at the first stored copy.
        await input.cache.put(input.url, response);
        // oxlint-disable-next-line no-await-in-loop -- Stops at the first stored copy.
        await input.onStored(input.url);
        return true;
      }
    } catch (error) {
      if (isQuotaError(error)) {
        // oxlint-disable-next-line no-await-in-loop -- The last step before giving up.
        await input.onQuotaExceeded();
        return false;
      }
      // Not in the HTTP cache yet, or refused: the next attempt, or the next miss, tries again.
    }
  }
  return false;
};

/** Cache Storage as the build floor uses it. */
export type FloorStorage = Pick<CacheStorage, 'has' | 'open' | 'delete'>;

/** The key the build floor is stored under in the worker's state cache: a path no deploy serves. */
export const buildFloorKey = '/__tau/build-floor';

/**
 * The build floor a worker stored, read without creating its cache (FP2).
 *
 * @param caches - The worker's Cache Storage.
 * @param cacheName - The state cache (`stateCacheName`).
 * @returns The floor, or `undefined` when none is stored or the stored value is no build id.
 */
export const readStoredBuildFloor = async (caches: FloorStorage, cacheName: string): Promise<number | undefined> => {
  if (!(await caches.has(cacheName))) {
    return undefined;
  }
  const cache = await caches.open(cacheName);
  const stored = await cache.match(buildFloorKey);
  const text = stored === undefined ? '' : await stored.text();
  const floor = /^\d+$/u.test(text) ? Number(text) : Number.NaN;
  return Number.isSafeInteger(floor) && floor > 0 ? floor : undefined;
};

/**
 * Keep the build floor for a worker started later; with none, delete the state cache, which holds nothing else (FP2).
 *
 * @param caches - The worker's Cache Storage.
 * @param cacheName - The state cache (`stateCacheName`).
 * @param floor - The floor the server reported, or `undefined` for none.
 */
export const storeBuildFloor = async (
  caches: FloorStorage,
  cacheName: string,
  floor: number | undefined,
): Promise<void> => {
  if (floor === undefined) {
    await caches.delete(cacheName);
    return;
  }
  const cache = await caches.open(cacheName);
  await cache.put(buildFloorKey, new Response(String(floor)));
};

/**
 * A writer of the build floor that lands floors in the order they were handed on (FP2): each write waits for the one
 * before, so a slower earlier write never overwrites a later floor, and a failed write is dropped without blocking the
 * next. Never rejects.
 *
 * @param caches - The worker's Cache Storage.
 * @param cacheName - The state cache (`stateCacheName`).
 * @param canWrite - Whether the worker may still write its caches, asked when each write's turn comes.
 * @returns Writes one floor (`undefined` for none) after every earlier one has settled.
 */
export const createBuildFloorWriter = (
  caches: FloorStorage,
  cacheName: string,
  canWrite: () => boolean,
): ((floor: number | undefined) => Promise<void>) => {
  let last: Promise<void> = Promise.resolve();
  return async (floor) => {
    const write = async (): Promise<void> => {
      try {
        if (canWrite()) {
          await storeBuildFloor(caches, cacheName, floor);
        }
      } catch {
        // Storage refused this one: the next floor is still written.
      }
    };
    const previous = last;
    last = (async () => {
      await previous;
      await write();
    })();
    return last;
  };
};
