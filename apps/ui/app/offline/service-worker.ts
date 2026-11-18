/**
 * The web app's one service worker (progressive loading PL7, Brain `research/progressive-loading-architecture.md`,
 * "Progressive web app and the single service worker"; ruling OD3).
 *
 * Built by `scripts/build-service-worker.ts` into `build/client/service-worker.js`: bundled with Google Workbox's
 * runtime modules, and its precache list injected at `self.__WB_MANIFEST` by `workbox-build`'s `injectManifest`. The
 * list is generated from the route-class registry: each answered class's document and the interactive tier (T1) its
 * document loads, never a deferred-tier, wasm, kernel or worker asset. Registered by `pwa-registration.ts`
 * in web builds only; the desktop and `tau serve` builds never register it.
 *
 * | Request | Answer |
 * | --- | --- |
 * | A navigation a class answers (`service-worker-routing.ts`) | Its precached document, cache-first (shells) or network-first within 3 s (`/usage`) |
 * | The same, on a reload or while a newer worker installs or waits | Network-first within 3 s, the precached document as the fallback |
 * | A precached file | The precache |
 * | Any other `/assets/*` or `/csharp-language/*` file | Cached on first use, with an expiry and a purge on quota errors |
 * | Everything else | No route: the browser handles it |
 *
 * Lifecycle: no `skipWaiting` on install, so an open page keeps the worker and precache it loaded with; a page activates
 * a waiting worker (`skipWaitingMessageType`) once its build-skew verdict is `replaced`, so the next document load gets
 * the new deploy. Activation claims pages no worker controlled yet (a first visit), deletes the previous version's
 * precache entries and the retired `/usage` worker's caches. Every stored response is replayed whole, so
 * `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`, `Cross-Origin-Resource-Policy` and the CSP come back as
 * the origin served them; no document is ever synthesised.
 */
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { PrecacheController, PrecacheRoute } from 'workbox-precaching';
import type { PrecacheEntry } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import type { RouteHandlerCallbackOptions, RouteMatchCallbackOptions } from 'workbox-core';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import {
  answerNavigation,
  installMessage,
  isCachedOnFirstUse,
  navigationCandidate,
  navigationNetworkTimeout,
  retryUnpinnedMiss,
} from '#offline/service-worker-routing.js';
import { assetCacheName, cachePrefix, skipWaitingMessageType } from '#offline/pwa-messages.js';
import { isRetiredWorkerCache } from '#offline/service-worker-retire.js';
import type { ServiceWorkerMessage } from '#offline/pwa-messages.js';

/** The worker global, as far as this file uses it (the DOM library has no `ServiceWorkerGlobalScope`). */
type WorkerScope = {
  readonly location: { readonly origin: string };
  readonly registration: { readonly installing: unknown; readonly waiting: unknown };
  readonly clients: { matchAll(options: { includeUncontrolled: boolean }): Promise<readonly ClientLike[]> };
  readonly caches: CacheStorage;
  // oxlint-disable-next-line typescript/no-restricted-types -- The Cookie Store API answers a missing cookie with `null`.
  readonly cookieStore?: { get(name: string): Promise<{ readonly value: string } | null> };
  skipWaiting(): Promise<void>;
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
  addEventListener(type: 'install' | 'activate', listener: (event: LifecycleEvent) => void): void;
  addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void;
};
/** The global `injectManifest` writes the precache list into (`scripts/build-service-worker.ts`'s injection point). */
type InjectedGlobal = {
  // oxlint-disable-next-line @typescript-eslint/naming-convention -- Workbox's injection point, not a normal identifier.
  readonly __WB_MANIFEST: Array<PrecacheEntry | string>;
};
type ClientLike = { postMessage(message: ServiceWorkerMessage): void };
/** An `ExtendableEvent` (install, activate, fetch), which the DOM library does not declare. */
type LifecycleEvent = { waitUntil(promise: Promise<unknown>): void };
/** Workbox's own view of the same event. */
type WorkboxEvent = Parameters<PrecacheController['install']>[0];
const asWorkboxEvent = (event: LifecycleEvent): WorkboxEvent => event as unknown as WorkboxEvent;

const scope = globalThis as unknown as WorkerScope;

setCacheNameDetails({ prefix: cachePrefix });

/* Precache requests carry no credentials: the documents are build outputs, and a hashed file asked for with the skew
 * protection cookie of another deploy would be answered by that deploy, which may not have it. Revisioned entries (the
 * documents) bypass the HTTP cache; hashed ones may come from it, so installing on a page that just loaded them costs
 * little. */
const precache = new PrecacheController({
  plugins: [
    {
      requestWillFetch: async ({ request }) => new Request(request, { credentials: 'omit' }),
    },
  ],
});
precache.addToCacheList((globalThis as unknown as InjectedGlobal).__WB_MANIFEST);

const postToPages = async (message: ServiceWorkerMessage): Promise<void> => {
  for (const client of await scope.clients.matchAll({ includeUncontrolled: true })) {
    client.postMessage(message);
  }
};

scope.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        await precache.install(asWorkboxEvent(event));
      } catch (error) {
        // Workbox leaves the version uninstalled; the previous one keeps serving. The page shows why, never guesses.
        await postToPages(installMessage(error));
        throw error;
      }
      await postToPages(installMessage());
    })(),
  );
});

scope.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await precache.activate(asWorkboxEvent(event));
      const names = await scope.caches.keys();
      const retired = names.filter((name) => isRetiredWorkerCache(name));
      await Promise.all(retired.map(async (name) => scope.caches.delete(name)));
    })(),
  );
});
clientsClaim();

scope.addEventListener('message', (event) => {
  if (
    typeof event.data === 'object' &&
    event.data !== null &&
    (event.data as { type?: unknown }).type === skipWaitingMessageType
  ) {
    // async-iife: bootstrap -- a message listener cannot await; activation proceeds on its own.
    void scope.skipWaiting();
  }
});

const isPrecached = (document: string): boolean => precache.getCacheKeyForURL(document) !== undefined;

/** Adds `Server-Timing: sw;desc=cache` to a document the precache answered, so field data can tell the two paths apart. */
const markServedFromCache = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.append('Server-Timing', 'sw;desc=cache');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

/** The precached document for a class, under its revisioned key. */
const readPrecachedDocument = async (document: string): Promise<Response | undefined> => {
  const response = await precache.matchPrecache(document);
  return response === undefined ? undefined : markServedFromCache(response);
};

/**
 * Network-first against a precached document: the network's own response when it answers within the bound, else the
 * precached document; never stored, so the precache stays this deploy's neutral document.
 */
const networkFirst = (document: string): NetworkFirst =>
  new NetworkFirst({
    cacheName: precache.strategy.cacheName,
    networkTimeoutSeconds: navigationNetworkTimeout / 1000,
    plugins: [
      {
        cacheWillUpdate: async () => null,
        cachedResponseWillBeUsed: async ({ cachedResponse }) =>
          cachedResponse === undefined ? undefined : markServedFromCache(cachedResponse),
        cacheKeyWillBeUsed: async ({ request, mode }) =>
          mode === 'read' ? (precache.getCacheKeyForURL(document) ?? request) : request,
      },
    ],
  });

/**
 * Ask the shell's own URL again in the background after the precache answered it: the CDN's response to it expires the
 * skew protection cookie (`static-shell.ts`, `marketing.ts`), which a worker's response cannot, so the page's later
 * `.data` and file requests are not pinned to a deploy older than this shell. Offline it fails quietly.
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

registerRoute(
  ({ request }: RouteMatchCallbackOptions) =>
    navigationCandidate(request, scope.location.origin, isPrecached) !== undefined,
  async ({ request, event }: RouteHandlerCallbackOptions) => {
    const extendable = event as unknown as LifecycleEvent;
    const candidate = navigationCandidate(request, scope.location.origin, isPrecached);
    if (candidate === undefined) {
      return scope.fetch(request);
    }
    const answer = answerNavigation({
      candidate,
      request,
      tauEntry: candidate.workerClass.routeClass.id === 'home' ? await readTauEntry() : undefined,
      updatePending: scope.registration.installing !== null || scope.registration.waiting !== null,
    });
    if (answer.kind === 'network') {
      return scope.fetch(request);
    }
    if (answer.kind === 'network-first') {
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- Workbox types the event as `ExtendableEvent`, which the DOM library lacks.
      return networkFirst(answer.document).handle({ request, event: asWorkboxEvent(extendable) });
    }
    const cached = await readPrecachedDocument(answer.document);
    if (cached === undefined) {
      return scope.fetch(request);
    }
    extendable.waitUntil(refreshSkewCookie(request.url));
    return cached;
  },
);

registerRoute(new PrecacheRoute(precache, { directoryIndex: '', cleanURLs: false, ignoreURLParametersMatching: [] }));

/* The cache-on-first-use rule for immutable files: the one seam the kernel asset delivery programme replaces. */
registerRoute(
  ({ request }: RouteMatchCallbackOptions) => isCachedOnFirstUse(request, scope.location.origin),
  new CacheFirst({
    cacheName: assetCacheName,
    plugins: [
      {
        fetchDidSucceed: async ({ request, response }) =>
          retryUnpinnedMiss(request, response, async (input, init) => scope.fetch(input, init)),
        cacheWillUpdate: async ({ response }) => (response.status === 200 ? response : null),
      },
      new ExpirationPlugin({ maxAgeSeconds: 30 * 24 * 60 * 60, maxEntries: 2000, purgeOnQuotaError: true }),
    ],
  }),
);
