/**
 * The web app's service worker's caches and the in-memory index of what they hold (PL7 service worker staging defects
 * blueprint, FP1), apart from the worker global so it is unit-tested with a fake `CacheStorage` and `fetch`.
 *
 * - **Precache.** Install stores every entry of the build's list it can fetch and never fails on one entry: a request
 *   only the worker makes can be refused (a content blocker, a policy keyed on request type) where the page's own
 *   would succeed, and an install that fails on it leaves the previous worker in place for good (D2, D16). Each
 *   document class's closure (`build-service-worker.ts`) is either all stored, and its shell may be served from the
 *   cache, or not, and it never is. Only a quota error fails the install. Activation deletes what no longer belongs to
 *   this list, the caches of the Workbox precache that pre-fix workers kept, and nothing else.
 * - **First-use cache** (`tau-assets`). A hashed file the page loaded is copied from the browser's HTTP cache
 *   (`only-if-cached`), never downloaded again (7d), and a copy that fails is dropped silently. Bounded by
 *   entries and age (`workbox-expiration`), and emptied on a quota error.
 * - **Index.** Loaded once per worker start; the fetch handler decides from it synchronously whether to answer.
 *
 * Precache keys carry Workbox's `__WB_REVISION__` query for revisioned entries (the documents), so a document that
 * changes between deploys is a new key.
 */
import { CacheExpiration } from 'workbox-expiration';
import { assetCacheName, cachePrefix } from '#offline/pwa-messages.js';
import { isQuotaError } from '#offline/service-worker-routing.js';
import type { StoreView } from '#offline/service-worker-routing.js';

/**
 * The precache of every worker built since FP1, one cache shared by its versions. Pre-fix workers kept Workbox's
 * `tau-precache-v2-<scope>`, which the next fixed worker deletes on activation; both match the kill switch's
 * `tau-precache-` prefix (`service-worker-retire.ts`).
 */
export const precacheCacheName = `${cachePrefix}-precache-v3`;

/** One precache entry as the build injects it. */
// oxlint-disable-next-line typescript/no-restricted-types -- Workbox's precache wire value for "no revision".
export type StoreEntry = Readonly<{ url: string; revision: string | null }>;

/** The build's precache list and, per document, the entries its class needs to boot (`build-service-worker.ts`). */
export type StoreManifest = Readonly<{
  entries: readonly StoreEntry[];
  classes: Readonly<Record<string, readonly string[]>>;
}>;

/** The worker global, as far as the store uses it. */
export type StoreScope = Readonly<{
  caches: Pick<CacheStorage, 'open' | 'has' | 'keys' | 'delete'>;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
}>;

/** What an install stored. */
export type InstallReport = Readonly<{
  /** Entries it could not store. */
  failed: readonly string[];
  /** Documents whose class closure is not all stored: never served from the cache. */
  incomplete: readonly string[];
}>;

/** The store. */
export type WorkerStore = StoreView &
  Readonly<{
    /** Load the index; every call after the first returns the same load. */
    load: () => Promise<void>;
    /** Whether a document's class closure is all stored (after {@link WorkerStore.load}). */
    isClassComplete: (document: string) => boolean;
    install: () => Promise<InstallReport>;
    activate: () => Promise<void>;
    /** The precache's response for a URL, or `undefined` when it holds none after all. */
    readPrecached: (url: string) => Promise<Response | undefined>;
    /** The first-use cache's response for a URL, or `undefined`. */
    readAsset: (url: string) => Promise<Response | undefined>;
    /**
     * Copy a file the browser is loading into the first-use cache from its HTTP cache once it lands there. Never
     * rejects; a copy not yet possible stays pending for {@link WorkerStore.flush}.
     */
    keep: (url: string) => Promise<void>;
    /** Whether a copy is pending. */
    hasPending: () => boolean;
    /** Try every pending copy again, at most once a second; a copy pending for over a minute is dropped. Never rejects. */
    flush: () => Promise<void>;
  }>;

/** The precache key of an entry. */
export const cacheKeyOf = (entry: StoreEntry): string =>
  entry.revision === null ? entry.url : `${entry.url}?__WB_REVISION__=${encodeURIComponent(entry.revision)}`;

/** A request URL's path and query, the index's key. */
const pathOf = (url: string): string => {
  const parsed = new URL(url, 'https://tau.invalid');
  return `${parsed.pathname}${parsed.search}`;
};

/** How many entries an install fetches at once. */
const installConcurrency = 6;

/** Timing of the copies from the HTTP cache, in milliseconds (`createWorkerStore`'s `timing` overrides it in tests). */
export const keepTiming: Readonly<{ copyDelay: number; flushInterval: number; giveUpAfter: number }> = {
  /** After the browser's own request, before its first copy is tried: the response must have landed. */
  copyDelay: 1000,
  /** The least time between two flushes of the pending copies. */
  flushInterval: 1000,
  /** How long a copy stays pending (a large file still downloading, or one the HTTP cache did not keep). */
  giveUpAfter: 60_000,
};

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/**
 * Create the store for one worker version.
 *
 * @param scope - The worker global.
 * @param manifest - The build's precache list and classes.
 * @param options - `timing` overrides {@link keepTiming}, `now` the clock (tests).
 * @returns The store.
 */
export const createWorkerStore = (
  scope: StoreScope,
  manifest: StoreManifest,
  options: Readonly<{ timing?: Partial<typeof keepTiming>; now?: () => number }> = {},
): WorkerStore => {
  const keys = new Map(manifest.entries.map((entry) => [entry.url, cacheKeyOf(entry)]));
  const precached = new Set<string>();
  const assets = new Set<string>();
  /** Pending copies: URL to when it was first asked for. */
  const pending = new Map<string, number>();
  const { copyDelay, flushInterval, giveUpAfter } = { ...keepTiming, ...options.timing };
  const now = options.now ?? Date.now;
  let lastFlush = 0;
  let flushing: Promise<void> | undefined;
  let loading: Promise<void> | undefined;
  let loaded = false;
  // Created on first use: the expiration plugin opens IndexedDB, which the store needs only once it keeps a file.
  let expiration: CacheExpiration | undefined;

  const readKeys = async (name: string): Promise<string[]> => {
    if (!(await scope.caches.has(name))) {
      return [];
    }
    const cache = await scope.caches.open(name);
    const requests = await cache.keys();
    return requests.map((request) => pathOf(request.url));
  };

  const loadAssets = async (): Promise<void> => {
    const stored = await readKeys(assetCacheName);
    assets.clear();
    for (const url of stored) {
      assets.add(url);
    }
  };

  const loadIndex = async (): Promise<void> => {
    try {
      const stored = new Set(await readKeys(precacheCacheName));
      precached.clear();
      for (const [url, key] of keys) {
        if (stored.has(key)) {
          precached.add(url);
        }
      }
      await loadAssets();
    } catch {
      // Storage unavailable: an empty index answers nothing, so every request stays the browser's.
      precached.clear();
      assets.clear();
    }
    loaded = true;
  };

  const load = async (): Promise<void> => {
    loading ??= loadIndex();
    return loading;
  };

  const isClassComplete = (document: string): boolean =>
    (manifest.classes[document] ?? [document]).every((url) => precached.has(url));

  const fetchEntry = async (cache: Cache, entry: StoreEntry, stored: ReadonlySet<string>): Promise<boolean> => {
    const key = cacheKeyOf(entry);
    if (stored.has(key)) {
      return true;
    }
    let response: Response;
    try {
      // Without credentials: a hashed file asked for with the skew protection cookie of another deploy would be
      // answered by that deploy. Revisioned entries (the documents) bypass the HTTP cache; hashed ones may come from it.
      response = await scope.fetch(key, {
        credentials: 'omit',
        cache: entry.revision === null ? 'default' : 'reload',
      });
    } catch {
      return false;
    }
    if (!response.ok || response.redirected) {
      return false;
    }
    // A quota error rejects here and fails the install.
    await cache.put(key, response);
    return true;
  };

  const install = async (): Promise<InstallReport> => {
    const cache = await scope.caches.open(precacheCacheName);
    const existing = await cache.keys();
    const stored = new Set(existing.map((request) => pathOf(request.url)));
    const pending = [...manifest.entries];
    const failed: string[] = [];
    const work = async (): Promise<void> => {
      for (let entry = pending.shift(); entry !== undefined; entry = pending.shift()) {
        // oxlint-disable-next-line no-await-in-loop -- Each lane fetches one entry at a time.
        if (!(await fetchEntry(cache, entry, stored))) {
          failed.push(entry.url);
        }
      }
    };
    await Promise.all(Array.from({ length: installConcurrency }, work));
    loading = undefined;
    await load();
    const incomplete = Object.keys(manifest.classes).filter((document) => !isClassComplete(document));
    return { failed: failed.toSorted(), incomplete };
  };

  const activate = async (): Promise<void> => {
    const wanted = new Set(keys.values());
    const cache = await scope.caches.open(precacheCacheName);
    const requests = await cache.keys();
    await Promise.all(
      requests.filter((request) => !wanted.has(pathOf(request.url))).map(async (request) => cache.delete(request)),
    );
    const names = await scope.caches.keys();
    const superseded = names.filter(
      (name) => name.startsWith(`${cachePrefix}-precache-`) && name !== precacheCacheName,
    );
    await Promise.all(superseded.map(async (name) => scope.caches.delete(name)));
    loading = undefined;
    await load();
  };

  const readFrom = async (name: string, key: string | undefined): Promise<Response | undefined> => {
    if (key === undefined) {
      return undefined;
    }
    const cache = await scope.caches.open(name);
    return cache.match(key);
  };

  const store = async (url: string, response: Response): Promise<void> => {
    try {
      const cache = await scope.caches.open(assetCacheName);
      await cache.put(url, response);
      assets.add(url);
      expiration ??= new CacheExpiration(assetCacheName, { maxEntries: 2000, maxAgeSeconds: 30 * 24 * 60 * 60 });
      await expiration.updateTimestamp(url);
      await expiration.expireEntries();
      await loadAssets();
    } catch (error) {
      if (isQuotaError(error)) {
        assets.clear();
        await scope.caches.delete(assetCacheName);
      }
    }
  };

  const copy = async (url: string): Promise<boolean> => {
    let response: Response | undefined;
    try {
      response = await scope.fetch(url, { cache: 'only-if-cached', mode: 'same-origin', credentials: 'same-origin' });
    } catch {
      return false;
    }
    if (response.status !== 200) {
      return false;
    }
    await store(url, response);
    return true;
  };

  const flushPending = async (): Promise<void> => {
    lastFlush = now();
    try {
      for (const [url, since] of pending) {
        // oxlint-disable-next-line no-await-in-loop -- One copy at a time: each is a cache read, never a download.
        if ((await copy(url)) || now() - since > giveUpAfter) {
          pending.delete(url);
        }
      }
    } finally {
      flushing = undefined;
    }
  };

  const flush = async (): Promise<void> => {
    if (pending.size === 0 || (flushing === undefined && now() - lastFlush < flushInterval)) {
      return;
    }
    flushing ??= flushPending();
    return flushing;
  };

  const keep = async (url: string): Promise<void> => {
    if (!assets.has(url) && !pending.has(url)) {
      pending.set(url, now());
    }
    // A short wait for the browser's own response to land in its HTTP cache; anything still pending is tried again on
    // later requests ({@link WorkerStore.flush}), so no event is held open for long.
    await sleep(copyDelay);
    lastFlush = 0;
    await flush();
  };

  return {
    isLoaded: () => loaded,
    isListed: (url) => keys.has(url),
    hasPrecached: (url) => precached.has(url),
    hasAsset: (url) => assets.has(url),
    load,
    isClassComplete,
    install,
    activate,
    readPrecached: async (url) => readFrom(precacheCacheName, keys.get(url)),
    readAsset: async (url) => readFrom(assetCacheName, url),
    keep,
    hasPending: () => pending.size > 0,
    flush,
  };
};
