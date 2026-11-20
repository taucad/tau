/**
 * The web app's one service worker (progressive loading PL7, Brain `research/progressive-loading-architecture.md`,
 * "Progressive web app and the single service worker"; ruling OD3; FP1 of Brain
 * `research/pl7-service-worker-staging-defects-blueprint.md`).
 *
 * Built by `scripts/build-service-worker.ts` into `build/client/service-worker.js`: bundled with Google Workbox's
 * precache bookkeeping, its precache list injected at `self.__WB_MANIFEST` by `workbox-build`'s `injectManifest`, and
 * each answered class's closure at `self.__TAU_PRECACHE_CLASSES`. The list is generated from the route-class registry:
 * each answered class's document and the interactive tier (T1) its document loads, never a deferred-tier, wasm, kernel
 * or worker asset. Registered by `pwa-registration.ts` in web builds only; the desktop and `tau serve` builds never
 * register it.
 *
 * **The rule.** The worker answers only from what it holds and never re-issues a request: a request the worker makes
 * is not the page's (it has no destination, and a content blocker or a policy keyed on request type may refuse it where
 * the page's own would pass), so a worker fetch on the page's behalf can fail a page no worker would fail.
 *
 * | Request | Answer |
 * | --- | --- |
 * | A navigation a class answers (`service-worker-routing.ts`), the class wholly stored | Its precached document, cache-first (shells) or network-first within 3 s (`/usage`) |
 * | The same, on a reload, while a newer worker installs or waits, or while the shells are out of bounds (older than 5 days, or below the server's `minBuildId`; FP2) | Network-first within 3 s, the precached document as the fallback |
 * | Any other GET navigation, or a class not wholly stored | The browser's own navigation: the navigation preload response |
 * | A safe-mode navigation (`?safe=1`) | None: the browser handles it (FP5) |
 * | A file the worker holds (precache, or cached on first use) | The cache |
 * | Any other request | None: the browser handles it. An `/assets/*` or `/csharp-language/*` file is then copied from the HTTP cache for offline use |
 *
 * Lifecycle: no `skipWaiting` on install, so an open page keeps the worker and precache it loaded with; a page activates
 * a waiting worker (`skipWaitingMessageType`) once its build-skew verdict is `replaced`, so the next document load gets
 * the new deploy, and a page already on the waiting worker's build activates it at once (`activateIfBuildMessageType`,
 * FP3). Over a pre-fix worker (its caches are unversioned or `precache-v2`) it skips waiting on install, since the
 * pages that worker stalls never run the code that would activate a successor (D16). Install never fails on an entry: it stores what it can fetch and reports the rest to its pages.
 * Activation turns navigation preload on, claims pages no worker controlled yet (a first visit), and deletes the
 * previous version's precache entries and the retired `/usage` worker's caches. Every stored response is replayed whole,
 * so `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`, `Cross-Origin-Resource-Policy` and the CSP come
 * back as the origin served them; no document is ever synthesised.
 */
import { setCacheNameDetails } from 'workbox-core';
import { CacheExpiration } from 'workbox-expiration';
import { PrecacheController } from 'workbox-precaching';
import type { PrecacheEntry } from 'workbox-precaching';
import {
  activatesWorker,
  answerNavigation,
  installMessage,
  isCachedOnFirstUse,
  isSafeModeNavigation,
  isShellInBounds,
  navigationCandidate,
  navigationNetworkTimeout,
} from '#offline/service-worker-routing.js';
import {
  completeDocuments,
  fillFromHttpCache,
  installPrecache,
  readStoredUrls,
  subresourceKey,
} from '#offline/service-worker-store.js';
import { assetCacheName, cachePrefix, precacheNamePart, stateCacheName } from '#offline/pwa-messages.js';
import { buildIdentityPath } from '#lib/build-identity.js';
import { isPreFixWorkerCache, isRetiredWorkerCache } from '#offline/pwa-caches.js';
import type { ServiceWorkerMessage } from '#offline/pwa-messages.js';

/** A `FetchEvent`, which the DOM library does not declare. */
type FetchEventLike = LifecycleEvent & {
  readonly request: Request;
  readonly preloadResponse: Promise<Response | undefined>;
  respondWith(response: Promise<Response> | Response): void;
};
/** The worker global, as far as this file uses it (the DOM library has no `ServiceWorkerGlobalScope`). */
type WorkerScope = {
  readonly location: { readonly origin: string };
  readonly navigator: { readonly onLine: boolean };
  readonly registration: {
    readonly installing: unknown;
    readonly waiting: unknown;
    readonly navigationPreload?: { enable(): Promise<void> };
  };
  readonly clients: {
    matchAll(options: { includeUncontrolled: boolean }): Promise<readonly ClientLike[]>;
    claim(): Promise<void>;
  };
  readonly caches: CacheStorage;
  // oxlint-disable-next-line typescript/no-restricted-types -- The Cookie Store API answers a missing cookie with `null`.
  readonly cookieStore?: { get(name: string): Promise<{ readonly value: string } | null> };
  skipWaiting(): Promise<void>;
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
  addEventListener(type: 'install' | 'activate', listener: (event: LifecycleEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
  addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void;
};
/** The globals the build writes into the worker (`scripts/build-service-worker.ts`'s injection points). */
type InjectedGlobal = {
  // oxlint-disable-next-line @typescript-eslint/naming-convention -- Workbox's injection point, not a normal identifier.
  readonly __WB_MANIFEST: Array<PrecacheEntry | string>;
  /** Each answered class's document and the files its closure holds, by URL. */
  // oxlint-disable-next-line @typescript-eslint/naming-convention -- An injection point, beside Workbox's.
  readonly __TAU_PRECACHE_CLASSES: Readonly<Record<string, readonly string[]>>;
  /** The build id of the deploy this worker belongs to, as its documents publish it (`TAU_BUILD_ID`), or `0`. */
  // oxlint-disable-next-line @typescript-eslint/naming-convention -- An injection point, beside Workbox's.
  readonly __TAU_BUILD_ID: number;
};
type ClientLike = { postMessage(message: ServiceWorkerMessage): void };
/** An `ExtendableEvent` (install, activate, fetch), which the DOM library does not declare. */
type LifecycleEvent = { waitUntil(promise: Promise<unknown>): void };
/** Workbox's own view of the same event. */
type WorkboxEvent = Parameters<PrecacheController['activate']>[0];
const asWorkboxEvent = (event: LifecycleEvent): WorkboxEvent => event as unknown as WorkboxEvent;

const scope = globalThis as unknown as WorkerScope;

// `tau-precache-v3-<scope>`: the version tells a fixed worker's caches from a pre-fix worker's (FP3).
setCacheNameDetails({ prefix: cachePrefix, precache: precacheNamePart });

/** The precache's bookkeeping: each entry's cache key, and the cleanup of a previous version's entries on activation. */
const precache = new PrecacheController();
// Read as `globalThis.<name>`, which the build replaces textually.
precache.addToCacheList((globalThis as unknown as InjectedGlobal).__WB_MANIFEST);
const precacheName = precache.strategy.cacheName;
const classes = (globalThis as unknown as InjectedGlobal).__TAU_PRECACHE_CLASSES;
const workerBuildId = (globalThis as unknown as InjectedGlobal).__TAU_BUILD_ID;
const assetExpiration = new CacheExpiration(assetCacheName, {
  maxAgeSeconds: 30 * 24 * 60 * 60,
  maxEntries: 2000,
});

const cacheKeyFor = (url: string): string | undefined => {
  try {
    return precache.getCacheKeyForURL(new URL(url, scope.location.origin).href);
  } catch {
    return undefined;
  }
};

/**
 * The index: the key of every response the precache holds and the URL of every file cached on first use. Loaded when
 * the worker starts; every navigation awaits it, and a subresource asked for before it is loaded gets no answer.
 */
let precached = new Set<string>();
let assets = new Set<string>();
/** The documents whose whole class is stored. */
let complete = new Set<string>();
let indexLoaded = false;

const loadIndex = async (): Promise<void> => {
  const [precacheCache, assetCache] = await Promise.all([
    scope.caches.open(precacheName),
    scope.caches.open(assetCacheName),
  ]);
  [precached, assets] = await Promise.all([readStoredUrls([precacheCache]), readStoredUrls([assetCache])]);
  complete = completeDocuments(classes, cacheKeyFor, precached);
  indexLoaded = true;
};
/** Settles with the promise's value, or `undefined` when it rejects: never rejects. */
const settle = async <T>(promise: Promise<T>): Promise<T | undefined> => {
  try {
    return await promise;
  } catch {
    return undefined;
  }
};
let indexReady = settle(loadIndex());
const reloadIndex = (): void => {
  indexReady = settle(loadIndex());
};

const postToPages = async (message: ServiceWorkerMessage): Promise<void> => {
  for (const client of await scope.clients.matchAll({ includeUncontrolled: true })) {
    client.postMessage(message);
  }
};

/** Whether this origin holds a pre-fix worker's caches, so this worker replaces one (FP3). */
const replacesPreFixWorker = async (): Promise<boolean> => {
  const names = await scope.caches.keys();
  return names.some((name) => isPreFixWorkerCache(name));
};

/**
 * The last build floor (`minBuildId`) the server reported on `/health/build`, kept in the worker's state cache so a
 * cold start knows it without the network (FP2). `undefined` when the server reported none.
 */
let buildFloor: number | undefined;
const buildFloorKey = '/__tau/build-floor';
const readStoredFloor = async (): Promise<void> => {
  if (!(await scope.caches.has(stateCacheName))) {
    return;
  }
  const cache = await scope.caches.open(stateCacheName);
  const stored = await cache.match(buildFloorKey);
  const value = stored === undefined ? Number.NaN : Number(await stored.text());
  buildFloor = Number.isSafeInteger(value) && value > 0 ? value : undefined;
};
/** The stored floor, read once per worker start by the first navigation; every later one awaits the same read. */
let floorRead: Promise<undefined | void> | undefined;
const readFloorOnce = async (): Promise<undefined | void> => {
  floorRead ??= settle(readStoredFloor());
  return floorRead;
};

/** Milliseconds between two asks of the server for its floor. */
const floorRefreshInterval = 60_000;
let floorAskedAt = Number.NEGATIVE_INFINITY;

/**
 * Ask `/health/build` for the server's floor in the background and keep it for the next navigation. The worker's own
 * request, never one on a page's behalf: refused or offline, the last floor stays. The `worker` query marks it for the
 * e2e harness's count of the page's build checks; the server ignores it.
 */
const refreshBuildFloor = async (): Promise<void> => {
  if (Date.now() - floorAskedAt < floorRefreshInterval) {
    return;
  }
  floorAskedAt = Date.now();
  try {
    const response = await scope.fetch(`${buildIdentityPath}?worker=1`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) {
      return;
    }
    const { minBuildId } = (await response.json()) as { minBuildId?: unknown };
    const floor =
      typeof minBuildId === 'number' && Number.isSafeInteger(minBuildId) && minBuildId > 0 ? minBuildId : undefined;
    buildFloor = floor;
    // The state cache holds only the floor: with none reported it is not kept at all.
    if (floor === undefined) {
      await scope.caches.delete(stateCacheName);
      return;
    }
    const cache = await scope.caches.open(stateCacheName);
    await cache.put(buildFloorKey, new Response(String(floor)));
  } catch {
    // Offline or refused: the last floor stays.
  }
};

scope.addEventListener('install', (event) => {
  event.waitUntil(refreshBuildFloor());
  event.waitUntil(
    (async () => {
      // A pre-fix worker can stall the pages it controls, which then never run the page code that would activate a
      // successor (D16): over one, this worker activates as soon as it is installed. With FP1 a page of another build
      // loses nothing under it online, since every miss is the browser's own request.
      const overPreFix = await replacesPreFixWorker();
      await indexReady;
      const cache = await scope.caches.open(precacheName);
      const report = await installPrecache({
        items: [...precache.getURLsToCacheKeys()].map(([url, cacheKey]) => ({
          url,
          cacheKey,
          revisioned: cacheKey !== url,
        })),
        stored: precached,
        fetchFile: async (request) => scope.fetch(request),
        cache,
        origin: scope.location.origin,
      });
      for (const key of report.stored) {
        precached.add(key);
      }
      complete = completeDocuments(classes, cacheKeyFor, precached);
      // The install completes either way: a class with a missing file is never served from the cache, and the page
      // shows the outcome (`offline-shell.tsx`).
      const failure =
        report.failed.length === 0
          ? undefined
          : {
              name: report.quotaExceeded ? 'QuotaExceededError' : 'Error',
              message: `${String(report.failed.length)} of ${String(report.failed.length + report.stored.length)} files not stored: ${report.failed[0]?.url ?? ''} ${report.failed[0]?.reason ?? ''}`,
            };
      await postToPages(installMessage(failure));
      if (overPreFix) {
        await scope.skipWaiting();
      }
    })(),
  );
});

scope.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Every network answer to a navigation is then the browser's own request (`event.preloadResponse`).
      await scope.registration.navigationPreload?.enable();
      await precache.activate(asWorkboxEvent(event));
      const names = await scope.caches.keys();
      // The retired `/usage` worker's caches and a pre-fix worker's, whose precache Workbox's cleanup cannot see.
      const retired = names.filter((name) => isRetiredWorkerCache(name) || isPreFixWorkerCache(name));
      await Promise.all(retired.map(async (name) => scope.caches.delete(name)));
      reloadIndex();
      await indexReady;
      await scope.clients.claim();
    })(),
  );
});

scope.addEventListener('message', (event) => {
  if (activatesWorker(event.data, workerBuildId)) {
    // async-iife: bootstrap -- a message listener cannot await; activation proceeds on its own.
    void scope.skipWaiting();
  }
});

/** Adds `Server-Timing: sw;desc=cache` to a document the precache answered, so field data can tell the two paths apart. */
const markServedFromCache = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.append('Server-Timing', 'sw;desc=cache');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

/** The precached document for a class, under its revisioned key. */
const readPrecachedDocument = async (document: string): Promise<Response | undefined> => {
  const key = cacheKeyFor(document);
  const cache = await scope.caches.open(precacheName);
  const response = key === undefined ? undefined : await cache.match(key);
  return response === undefined ? undefined : markServedFromCache(response);
};

/**
 * The browser's own answer to a navigation: the navigation preload response. Only a browser that sent none (preload
 * unsupported) has the request passed to `fetch`.
 */
const readNavigation = async (event: FetchEventLike): Promise<Response> =>
  (await event.preloadResponse) ?? scope.fetch(event.request);

/**
 * Network-first against a precached document: the browser's own response when it arrives within the bound, else the
 * precached document; a failed network answer falls back to it at once.
 */
const networkFirst = async (event: FetchEventLike, document: string): Promise<Response> => {
  const network = settle(readNavigation(event));
  const timedOut = new Promise<undefined>((resolve) => {
    setTimeout(resolve, navigationNetworkTimeout);
  });
  const first = await Promise.race([network, timedOut]);
  if (first !== undefined) {
    return first;
  }
  // Late or failed: the precached document; with none, the network's answer or its failure.
  return (await readPrecachedDocument(document)) ?? (await network) ?? readNavigation(event);
};

/**
 * Ask the shell's own URL again in the background after the precache answered it: the CDN's response to it expires the
 * skew protection cookie (`static-shell.ts`, `marketing.ts`), which a worker's response cannot, so the page's later
 * `.data` and file requests are not pinned to a deploy older than this shell. Offline or refused it fails quietly: it
 * answers no request.
 */
const refreshSkewCookie = async (url: string): Promise<void> => {
  try {
    await scope.fetch(url, { method: 'HEAD', cache: 'no-store', redirect: 'manual', credentials: 'same-origin' });
  } catch {
    // Offline or refused: the cookie is only a pin, and the next online open refreshes it.
  }
};

const readTauEntry = async (): Promise<string | undefined> => {
  try {
    const cookie = await scope.cookieStore?.get('tau-entry');
    return cookie?.value;
  } catch {
    return undefined;
  }
};

const answerNavigationEvent = async (event: FetchEventLike): Promise<Response> => {
  const { request } = event;
  await indexReady;
  const candidate = navigationCandidate(request, scope.location.origin, (document) => complete.has(document));
  if (candidate === undefined) {
    return readNavigation(event);
  }
  await readFloorOnce();
  event.waitUntil(refreshBuildFloor());
  const answer = answerNavigation({
    candidate,
    request,
    tauEntry: candidate.workerClass.routeClass.id === 'home' ? await readTauEntry() : undefined,
    updatePending: scope.registration.installing !== null || scope.registration.waiting !== null,
    shellInBounds: isShellInBounds({ buildId: workerBuildId, now: Date.now(), floor: buildFloor }),
  });
  if (answer.kind === 'network') {
    return readNavigation(event);
  }
  if (answer.kind === 'network-first') {
    return networkFirst(event, answer.document);
  }
  const cached = await readPrecachedDocument(answer.document);
  if (cached === undefined) {
    return readNavigation(event);
  }
  // The browser sent its own navigation alongside; letting it settle keeps it from being reported as cancelled.
  event.waitUntil(settle(event.preloadResponse));
  event.waitUntil(refreshSkewCookie(request.url));
  return cached;
};

/** A response the index says the worker holds. */
const answerFromCache = async (event: FetchEventLike, cacheName: string, key: string): Promise<Response> => {
  const cache = await scope.caches.open(cacheName);
  const response = await cache.match(key);
  if (response !== undefined) {
    return response;
  }
  // Only when storage was cleared under the worker: the index is wrong. It is read again, and this one request goes to
  // the network as the browser would have sent it.
  reloadIndex();
  return scope.fetch(event.request);
};

/** Where the worker holds a subresource, by the index. */
const locateStored = (url: string): ReturnType<typeof subresourceKey> =>
  subresourceKey({ url, cacheKeyFor, precached, assets, precacheName, assetCacheName });

/**
 * Offline, before the index is loaded: wait for it, then answer from the cache, or with a network error for a file the
 * worker does not hold (the network the browser would ask is offline).
 */
const answerOfflineAfterIndex = async (event: FetchEventLike): Promise<Response> => {
  await indexReady;
  const location = locateStored(event.request.url);
  if (location === undefined) {
    return Response.error();
  }
  const cache = await scope.caches.open(location.cacheName);
  return (await cache.match(location.key)) ?? Response.error();
};

/** URLs a copy is already waiting on, so repeated misses start one copy each. */
const filling = new Set<string>();

/** After the page's own request for a file, copy it from the HTTP cache into the asset cache, for offline use. */
const keepForOffline = (event: FetchEventLike, url: string): void => {
  filling.add(url);
  const copy = async (): Promise<void> => {
    try {
      const cache = await scope.caches.open(assetCacheName);
      await fillFromHttpCache({
        url,
        fetchFile: async (input, init) => scope.fetch(input, init),
        cache,
        wait: async (milliseconds) =>
          new Promise<void>((resolve) => {
            setTimeout(resolve, milliseconds);
          }),
        onStored: async (storedUrl) => {
          assets.add(storedUrl);
          await assetExpiration.updateTimestamp(storedUrl);
          await assetExpiration.expireEntries();
          assets = await readStoredUrls([cache]);
        },
        onQuotaExceeded: async () => {
          await scope.caches.delete(assetCacheName);
          reloadIndex();
        },
      });
    } catch {
      // The copy is only for offline use: the next miss tries again.
    } finally {
      filling.delete(url);
    }
  };
  event.waitUntil(copy());
};

scope.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  if (request.mode === 'navigate') {
    if (isSafeModeNavigation(request.url)) {
      // Safe mode is the way out of a page the worker cannot boot: never the worker's answer (FP5).
      return;
    }
    event.respondWith(answerNavigationEvent(event));
    return;
  }
  // Decided now, from the index: before it is loaded the worker answers nothing online, so the request stays the
  // browser's own. Offline the network cannot answer it anyway, so a worker restarted by this very request waits for
  // its index and answers from the cache, or with a network error for a file it does not hold.
  if (!indexLoaded) {
    if (!scope.navigator.onLine) {
      event.respondWith(answerOfflineAfterIndex(event));
    }
    return;
  }
  const location = locateStored(request.url);
  if (location !== undefined) {
    event.respondWith(answerFromCache(event, location.cacheName, location.key));
    return;
  }
  // A miss: no answer, so the request stays the browser's own.
  if (isCachedOnFirstUse(request, scope.location.origin) && !filling.has(request.url)) {
    keepForOffline(event, request.url);
  }
});
