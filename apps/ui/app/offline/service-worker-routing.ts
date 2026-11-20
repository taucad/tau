/**
 * What the web app's one service worker does with a request (progressive loading PL7, Brain
 * `research/progressive-loading-architecture.md`, "Progressive web app and the single service worker"; PL7 service
 * worker staging defects blueprint, FP1).
 *
 * Pure decisions, so the worker's routing and update rule are unit-tested without a worker: `service-worker.ts` binds
 * them to the worker's events. Product rules no library knows live here:
 *
 * - **The worker answers only from what it holds, and never re-issues a request.** A request the worker makes is not
 *   the page's: it has no destination, loses a navigation's mode, and a content blocker, an extension's per-site pause or
 *   a policy keyed on request type may refuse it where it lets the page's own request through. So every network answer
 *   to a navigation is the browser's navigation preload, and a subresource is answered only when this worker's
 *   in-memory index ({@link StoreView}) says the cache holds it: a miss gets no answer at all, and the browser keeps
 *   the request its own.
 * - A document is answered only for a class of the route-class registry that names a {@link WorkerDelivery}, and only
 *   with that class's precached document of this worker's deploy, replayed whole (headers included, so cross-origin
 *   isolation holds), and only when the class's whole closure is stored. Home (`/`) only for a visit the deployed site
 *   gives the app (`homeAppEntry`).
 * - A cache-first document asks the network first instead on a reload, and while a newer worker is installing or
 *   waiting, so neither a reload nor the update rule ever lands on a replaced deploy (ruling OD3).
 * - Hashed and digest-addressed static files are kept on first use ({@link isCachedOnFirstUse}), copied from the
 *   browser's HTTP cache after the page loaded them, never downloaded again; everything else, API, auth, payment,
 *   `.data`, `/__manifest`, marketing pages, writes and every cross-origin request, reaches the browser untouched.
 *
 * Imports only the registry, which imports nothing, so the worker bundle stays small.
 */
import { homeAppEntry, workerRouteClasses } from '#lib/route-classes.js';
import type { WorkerRouteClass } from '#lib/route-classes.js';
import { serviceWorkerMessageType } from '#offline/pwa-messages.js';
import type { ServiceWorkerMessage } from '#offline/pwa-messages.js';

/** Milliseconds a network-first document waits for the network before the precached one answers (B5's bound). */
export const navigationNetworkTimeout = 3000;

/** The classes the worker answers, from the registry. */
export const workerClasses: readonly WorkerRouteClass[] = workerRouteClasses();

/** Minimal view of an intercepted request. */
export type RequestFacts = Readonly<{
  url: string;
  method: string;
  mode: string;
  /** The request's cache mode: a reload asks `no-cache` (or `reload` when forced). */
  cache: string;
}>;

/** A document class the worker answers a navigation for, before the per-request facts are read. */
export type NavigationCandidate = Readonly<{ workerClass: WorkerRouteClass }>;

/**
 * The class whose document may answer a navigation, decided synchronously (a fetch event must choose whether to
 * respond at once): a same-origin GET navigation to a URL a worker class matches, whose document this worker's
 * precache lists. Whether the class's closure is stored is read after, once the index has loaded.
 *
 * @param request - The intercepted request.
 * @param origin - The worker's origin.
 * @param isListed - Whether a document URL is in this worker's precache list.
 * @returns The candidate, or `undefined` to leave the request to the browser.
 */
export const navigationCandidate = (
  request: RequestFacts,
  origin: string,
  isListed: (document: string) => boolean,
): NavigationCandidate | undefined => {
  if (request.method !== 'GET' || request.mode !== 'navigate') {
    return undefined;
  }
  const url = new URL(request.url);
  if (url.origin !== origin) {
    return undefined;
  }
  const workerClass = workerClasses.find((candidate) => candidate.matches(url.pathname));
  if (workerClass === undefined || !isListed(workerClass.document)) {
    return undefined;
  }
  return { workerClass };
};

/** The query parameter of safe mode (`#lib/boot-signals` `safeModeParameter`; kept here so the worker bundles nothing more). */
export const safeModeQueryParameter = 'safe';

/**
 * Whether a navigation is safe mode's (`/?safe=1`): recovery the worker must never stand in, so the browser's own
 * request answers it (PL7 FP5, D5).
 *
 * @param url - The navigation's URL.
 * @returns `true` for safe mode.
 */
export const isSafeModeNavigation = (url: string): boolean =>
  new URL(url).searchParams.get(safeModeQueryParameter) === '1';

/** How one navigation is answered. */
export type NavigationAnswer =
  | Readonly<{ kind: 'network' }>
  | Readonly<{ kind: 'cache-first' | 'network-first'; document: string }>;

/** Cache modes a navigation carries when the user asked for a fresh page (a reload). */
const freshCacheModes = new Set(['reload', 'no-cache', 'no-store']);

/**
 * How a candidate navigation is answered, from the facts read after the worker chose to respond.
 *
 * @param input - The candidate, the request, the `tau-entry` cookie (Home only), whether a newer worker of this
 *   registration is installing or waiting, and whether this worker stored the class's whole closure.
 * @returns `network` answers with the browser's own navigation (the preload); otherwise the document and the order to
 *   try.
 */
export const answerNavigation = (
  input: Readonly<{
    candidate: NavigationCandidate;
    request: RequestFacts;
    tauEntry: string | undefined;
    updatePending: boolean;
    classComplete: boolean;
  }>,
): NavigationAnswer => {
  const { workerClass } = input.candidate;
  const url = new URL(input.request.url);
  if (!input.classComplete) {
    // A shell whose closure is not all stored would boot with the network on its path anyway: never serve it.
    return { kind: 'network' };
  }
  if (workerClass.routeClass.id === 'home' && !homeAppEntry(url.searchParams, input.tauEntry)) {
    return { kind: 'network' };
  }
  if (workerClass.delivery === 'network-first') {
    return { kind: 'network-first', document: workerClass.document };
  }
  if (input.updatePending || freshCacheModes.has(input.request.cache)) {
    return { kind: 'network-first', document: workerClass.document };
  }
  return { kind: 'cache-first', document: workerClass.document };
};

/**
 * Whether a request is for a file the worker keeps on first use: a same-origin GET of a content-hashed build asset
 * (`/assets/*`) or a digest-addressed runtime file (`/csharp-language/<sha>/…`), immutable by URL. This is the seam the
 * kernel asset delivery programme replaces with its digest-keyed store (KA4, KA5); nothing else may grow here.
 *
 * @param request - The intercepted request.
 * @param origin - The worker's origin.
 * @returns `true` for such a file.
 */
export const isCachedOnFirstUse = (request: Pick<RequestFacts, 'url' | 'method'>, origin: string): boolean => {
  if (request.method !== 'GET') {
    return false;
  }
  const url = new URL(request.url);
  return url.origin === origin && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/csharp-language/'));
};

/** What the worker knows synchronously about its caches: its in-memory index (`service-worker-store.ts`). */
export type StoreView = Readonly<{
  /** Whether the index has loaded since the worker started. */
  isLoaded: () => boolean;
  /** Whether a URL (path and query) is in this worker's precache list. */
  isListed: (url: string) => boolean;
  /** Whether the precache holds a URL. */
  hasPrecached: (url: string) => boolean;
  /** Whether the first-use cache holds a URL. */
  hasAsset: (url: string) => boolean;
}>;

/** How the worker answers a request that is not a navigation. */
export type SubresourceAnswer =
  | Readonly<{ kind: 'precache' | 'asset'; url: string }>
  /** No answer: the browser makes the request itself. With `keep`, the worker copies the file once the browser has it. */
  | Readonly<{ kind: 'browser'; keep: string | undefined }>;

/**
 * How the worker answers a same-origin or cross-origin request that is not a navigation, decided synchronously from
 * the index: from the cache only when the index says the cache holds it, never with a request of its own.
 *
 * @param request - The intercepted request.
 * @param origin - The worker's origin.
 * @param store - The index.
 * @returns The answer.
 */
export const answerSubresource = (
  request: Pick<RequestFacts, 'url' | 'method' | 'mode'>,
  origin: string,
  store: StoreView,
): SubresourceAnswer => {
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.mode === 'navigate' || url.origin !== origin || !store.isLoaded()) {
    return { kind: 'browser', keep: undefined };
  }
  const key = `${url.pathname}${url.search}`;
  if (store.hasPrecached(key)) {
    return { kind: 'precache', url: key };
  }
  if (!isCachedOnFirstUse(request, origin)) {
    return { kind: 'browser', keep: undefined };
  }
  if (store.hasAsset(key)) {
    return { kind: 'asset', url: key };
  }
  // A file this worker's precache lists is the install's to store; keeping a second copy is what 7d removed.
  return { kind: 'browser', keep: store.isListed(key) ? undefined : key };
};

/**
 * The build id a document carries (`window.ENV.TAU_BUILD_ID`, written by the root loader into every document).
 *
 * @param html - The document.
 * @returns The build id, or `undefined` when the document names none.
 */
export const readDocumentBuildId = (html: string): number | undefined => {
  const match = /TAU_BUILD_ID\\?":\\?"(\d+)/u.exec(html);
  return match?.[1] === undefined ? undefined : Number(match[1]);
};

/**
 * Whether a precache install failure was the origin's storage quota.
 *
 * @param error - The install's rejection.
 * @returns `true` for a quota error in any engine.
 */
export const isQuotaError = (error: unknown): boolean => {
  // A `DOMException` is not an `Error` instance in every engine.
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
};

const describeError = (error: unknown): string => {
  const message = typeof error === 'object' && error !== null ? (error as { message?: unknown }).message : error;
  return typeof message === 'string' ? message : 'unknown error';
};

/**
 * The message a finished install posts to its pages.
 *
 * @param outcome - The install's rejection, the documents whose closure it could not store, or nothing when it stored
 *   every class.
 * @returns The message: `ready` only when every class can open offline.
 */
export const installMessage = (
  outcome?: Readonly<{ error: unknown }> | Readonly<{ incomplete: readonly string[] }>,
): ServiceWorkerMessage => {
  if (outcome === undefined || ('incomplete' in outcome && outcome.incomplete.length === 0)) {
    return { type: serviceWorkerMessageType, status: 'ready' };
  }
  if ('incomplete' in outcome) {
    return {
      type: serviceWorkerMessageType,
      status: 'failed',
      detail: `not stored for offline use: ${outcome.incomplete.join(', ')}`,
    };
  }
  return {
    type: serviceWorkerMessageType,
    status: isQuotaError(outcome.error) ? 'quota-exceeded' : 'failed',
    detail: describeError(outcome.error),
  };
};
