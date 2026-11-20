/**
 * The web app's one service worker (progressive loading PL7, Brain `research/progressive-loading-architecture.md`,
 * "Progressive web app and the single service worker"; ruling OD3; PL7 service worker staging defects blueprint, FP1).
 *
 * Built by `scripts/build-service-worker.ts` into `build/client/service-worker.js`: bundled with the expiration module
 * of Google Workbox, its precache list injected at `self.__WB_MANIFEST` by `workbox-build`'s `injectManifest`, and each
 * document class's closure at `globalThis.__TAU_PRECACHE_CLASSES`. The list is generated from the route-class registry:
 * each answered class's document and the interactive tier (T1) its document loads, never a deferred-tier, wasm, kernel
 * or worker asset. Registered by `pwa-registration.ts` in web builds only; the desktop and `tau serve` builds never
 * register it.
 *
 * **The worker answers only from what it holds, and never re-issues a request** (`service-worker-routing.ts`):
 *
 * | Request | Answer |
 * | --- | --- |
 * | A navigation a class answers, the class's closure stored | Its precached document, cache-first (shells) or network-first within 3 s (`/usage`) |
 * | The same, on a reload or while a newer worker installs or waits | Network-first within 3 s, the precached document as the fallback |
 * | Any other navigation in scope, or a class not all stored | The browser's own navigation (navigation preload) |
 * | A file the precache or the first-use cache holds, by the in-memory index | The cache |
 * | Anything else | No answer: the browser makes its own request; a hashed file is copied from the HTTP cache afterwards |
 *
 * Every network answer to a navigation is `event.preloadResponse`: the browser's own request, a navigation to the
 * server and to any content blocker, whose `Set-Cookie` the browser applies (so it also refreshes the skew protection
 * cookie a cached shell could not). Navigations are answered only where navigation preload exists.
 *
 * Lifecycle: no `skipWaiting` on install, so an open page keeps the worker and precache it loaded with; a page activates
 * a waiting worker (`skipWaitingMessageType`) once its build-skew verdict is `replaced`, so the next document load gets
 * the new deploy. Install stores what it can and fails only on quota (`service-worker-store.ts`). Activation enables
 * navigation preload, claims pages no worker controlled yet (a first visit), deletes the previous version's precache
 * entries, a pre-fix worker's precache and the retired `/usage` worker's caches. Every stored response is replayed whole,
 * so `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`, `Cross-Origin-Resource-Policy` and the CSP come back
 * as the origin served them; no document is ever synthesised.
 */
import {
  answerNavigation,
  answerSubresource,
  installMessage,
  navigationCandidate,
  navigationNetworkTimeout,
} from '#offline/service-worker-routing.js';
import type { NavigationCandidate, SubresourceAnswer } from '#offline/service-worker-routing.js';
import { createWorkerStore } from '#offline/service-worker-store.js';
import type { StoreEntry } from '#offline/service-worker-store.js';
import { skipWaitingMessageType } from '#offline/pwa-messages.js';
import { isRetiredWorkerCache } from '#offline/service-worker-retire.js';
import type { ServiceWorkerMessage } from '#offline/pwa-messages.js';

/** An `ExtendableEvent` (install, activate, fetch), which the DOM library does not declare. */
type LifecycleEvent = { waitUntil(promise: Promise<unknown>): void };
/** A `FetchEvent`, as far as this file uses it. */
type FetchEventLike = LifecycleEvent & {
  readonly request: Request;
  /** The browser's navigation preload: `undefined` where the platform has none, resolves `undefined` when disabled. */
  readonly preloadResponse?: Promise<Response | undefined>;
  respondWith(response: Promise<Response>): void;
};
type ClientLike = { postMessage(message: ServiceWorkerMessage): void };

/** The worker global, as far as this file uses it (the DOM library has no `ServiceWorkerGlobalScope`). */
type WorkerScope = {
  readonly location: { readonly origin: string };
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
/** The globals the build writes the precache list and its classes into (`scripts/build-service-worker.ts`). */
type InjectedGlobal = {
  // oxlint-disable-next-line @typescript-eslint/naming-convention -- Workbox's injection point, not a normal identifier.
  readonly __WB_MANIFEST: readonly StoreEntry[];
  // oxlint-disable-next-line @typescript-eslint/naming-convention -- The build's define, not a normal identifier.
  readonly __TAU_PRECACHE_CLASSES: Readonly<Record<string, readonly string[]>>;
};

const scope = globalThis as unknown as WorkerScope;

const store = createWorkerStore(
  { caches: scope.caches, fetch: async (input, init) => scope.fetch(input, init) },
  // Read as written: the build replaces these two expressions textually.
  {
    entries: (globalThis as unknown as InjectedGlobal).__WB_MANIFEST,
    classes: (globalThis as unknown as InjectedGlobal).__TAU_PRECACHE_CLASSES,
  },
);
// async-iife: bootstrap -- the index loads at worker start; a request before it is the browser's.
void store.load();

const postToPages = async (message: ServiceWorkerMessage): Promise<void> => {
  for (const client of await scope.clients.matchAll({ includeUncontrolled: true })) {
    client.postMessage(message);
  }
};

scope.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const report = await store.install();
        await postToPages(installMessage({ incomplete: report.incomplete }));
      } catch (error) {
        // Only quota fails an install: the version stays uninstalled and the previous one keeps serving.
        await postToPages(installMessage({ error }));
        throw error;
      }
    })(),
  );
});

scope.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await scope.registration.navigationPreload?.enable();
      await store.activate();
      const names = await scope.caches.keys();
      const retired = names.filter((name) => isRetiredWorkerCache(name));
      await Promise.all(retired.map(async (name) => scope.caches.delete(name)));
      await scope.clients.claim();
    })(),
  );
});

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

/** Adds `Server-Timing: sw;desc=cache` to a document the precache answered, so field data can tell the two paths apart. */
const markServedFromCache = (response: Response): Response => {
  const headers = new Headers(response.headers);
  headers.append('Server-Timing', 'sw;desc=cache');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

/** The precached document for a class, under its revisioned key. */
const readPrecachedDocument = async (document: string): Promise<Response | undefined> => {
  const response = await store.readPrecached(document);
  return response === undefined ? undefined : markServedFromCache(response);
};

const readTauEntry = async (): Promise<string | undefined> => {
  try {
    const cookie = await scope.cookieStore?.get('tau-entry');
    return cookie?.value;
  } catch {
    return undefined;
  }
};

/** Resolves `timeout` after the bound, so a slow network loses the race to the precached document. */
const after = async (milliseconds: number): Promise<'timeout'> =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve('timeout');
    }, milliseconds);
  });

/** The preload's response, or `undefined` when it failed (offline): never a rejection left unhandled. */
const settle = async (preload: Promise<Response | undefined>): Promise<Response | undefined> => {
  try {
    return await preload;
  } catch {
    return undefined;
  }
};

/**
 * The browser's own navigation, its preload: what the page gets whenever the network answers a navigation. A
 * rejection is the browser's network error, which reaches the page as it would without a worker. Preload is enabled
 * on activation, so it is always there; only a platform that dropped it gets a plain fetch.
 */
const answerWithPreload = async (event: FetchEventLike, preload: Promise<Response | undefined>): Promise<Response> => {
  const response = await preload;
  return response ?? scope.fetch(event.request);
};

const answerNavigationEvent = async (
  event: FetchEventLike,
  preload: Promise<Response | undefined>,
  candidate: NavigationCandidate,
): Promise<Response> => {
  const network = async (): Promise<Response> => answerWithPreload(event, preload);
  // The preload runs whether or not its answer is used: it is the request that refreshes the page's cookies.
  event.waitUntil(settle(preload));
  await store.load();
  const answer = answerNavigation({
    candidate,
    request: event.request,
    tauEntry: candidate.workerClass.routeClass.id === 'home' ? await readTauEntry() : undefined,
    updatePending: scope.registration.installing !== null || scope.registration.waiting !== null,
    classComplete: store.isClassComplete(candidate.workerClass.document),
  });
  if (answer.kind === 'network') {
    return network();
  }
  if (answer.kind === 'network-first') {
    const raced = await Promise.race([settle(preload), after(navigationNetworkTimeout)]);
    if (raced !== 'timeout' && raced !== undefined) {
      return raced;
    }
  }
  const cached = await readPrecachedDocument(answer.document);
  return cached ?? network();
};

/** Answers a file the index says a cache holds; an entry gone since (another version's activation) is the network's. */
const answerFromCache = async (event: FetchEventLike, read: Promise<Response | undefined>): Promise<Response> =>
  (await read) ?? scope.fetch(event.request);

scope.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode === 'navigate') {
    const preload = event.preloadResponse;
    if (request.method !== 'GET' || preload === undefined || scope.registration.navigationPreload === undefined) {
      return;
    }
    const candidate = navigationCandidate(request, scope.location.origin, store.isListed);
    // Every GET navigation is answered, a class's or not: once preload is on, a navigation the worker leaves alone is
    // requested twice, the preload and then the browser's own.
    event.respondWith(
      candidate === undefined ? answerWithPreload(event, preload) : answerNavigationEvent(event, preload, candidate),
    );
    return;
  }
  const answer: SubresourceAnswer = answerSubresource(request, scope.location.origin, store);
  switch (answer.kind) {
    case 'precache': {
      event.respondWith(answerFromCache(event, store.readPrecached(answer.url)));
      break;
    }
    case 'asset': {
      event.respondWith(answerFromCache(event, store.readAsset(answer.url)));
      break;
    }
    case 'browser': {
      const { keep }: { readonly keep: string | undefined } = answer;
      if (keep !== undefined) {
        event.waitUntil(store.keep(keep));
        return;
      }
      break;
    }
  }
  if (store.hasPending()) {
    // Copies the HTTP cache could not give yet are tried again on later requests, never by holding one event open.
    event.waitUntil(store.flush());
  }
});
