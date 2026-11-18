/**
 * What the web app's one service worker does with a request (progressive loading PL7, Brain
 * `research/progressive-loading-architecture.md`, "Progressive web app and the single service worker").
 *
 * Pure decisions, so the worker's routing and update rule are unit-tested without a worker: `service-worker.ts` binds
 * them to Workbox. Product rules no library knows live here:
 *
 * - A document is answered only for a class of the route-class registry that names a {@link WorkerDelivery}, and only
 *   with that class's precached document of this worker's deploy, replayed whole (headers included, so
 *   cross-origin isolation holds). Home (`/`) only for a visit the deployed site gives the app (`homeAppEntry`).
 * - A cache-first document asks the network first instead on a reload, and while a newer worker is installing or
 *   waiting, so neither a reload nor the update rule ever lands on a replaced deploy (ruling OD3).
 * - Hashed and digest-addressed static files are cached on first use ({@link cacheOnFirstUse}); everything else, API,
 *   auth, payment, `.data`, `/__manifest`, marketing pages, writes and every cross-origin request, has no route and
 *   reaches the browser untouched.
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
 * respond at once): a same-origin GET navigation to a URL a worker class matches, whose document this worker
 * precached.
 *
 * @param request - The intercepted request.
 * @param origin - The worker's origin.
 * @param isPrecached - Whether a document URL is in this worker's precache.
 * @returns The candidate, or `undefined` to leave the request to the browser.
 */
export const navigationCandidate = (
  request: RequestFacts,
  origin: string,
  isPrecached: (document: string) => boolean,
): NavigationCandidate | undefined => {
  if (request.method !== 'GET' || request.mode !== 'navigate') {
    return undefined;
  }
  const url = new URL(request.url);
  if (url.origin !== origin) {
    return undefined;
  }
  const workerClass = workerClasses.find((candidate) => candidate.matches(url.pathname));
  if (workerClass === undefined || !isPrecached(workerClass.document)) {
    return undefined;
  }
  return { workerClass };
};

/** How one navigation is answered. */
export type NavigationAnswer =
  | Readonly<{ kind: 'network' }>
  | Readonly<{ kind: 'cache-first' | 'network-first'; document: string }>;

/** Cache modes a navigation carries when the user asked for a fresh page (a reload). */
const freshCacheModes = new Set(['reload', 'no-cache', 'no-store']);

/**
 * How a candidate navigation is answered, from the facts read after the worker chose to respond.
 *
 * @param input - The candidate, the request, the `tau-entry` cookie (Home only) and whether a newer worker of this
 *   registration is installing or waiting.
 * @returns `network` passes the request through unchanged; otherwise the document and the order to try.
 */
export const answerNavigation = (
  input: Readonly<{
    candidate: NavigationCandidate;
    request: RequestFacts;
    tauEntry: string | undefined;
    updatePending: boolean;
  }>,
): NavigationAnswer => {
  const { workerClass } = input.candidate;
  const url = new URL(input.request.url);
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
 * Whether a request is for a file the worker caches on first use: a same-origin GET of a content-hashed build asset
 * (`/assets/*`) or a digest-addressed runtime file (`/csharp-language/<sha>/…`), immutable by URL. This is the seam the
 * kernel asset delivery programme replaces with its digest-keyed store (KA4, KA5); nothing else may grow here.
 *
 * @param request - The intercepted request.
 * @param origin - The worker's origin.
 * @returns `true` when {@link cacheOnFirstUse} answers it.
 */
export const isCachedOnFirstUse = (request: Pick<RequestFacts, 'url' | 'method'>, origin: string): boolean => {
  if (request.method !== 'GET') {
    return false;
  }
  const url = new URL(request.url);
  return url.origin === origin && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/csharp-language/'));
};

/**
 * The network answer for a file cached on first use, robust to a skew pin from another deploy. A static shell the
 * worker serves cannot expire the skew protection cookie (`tau_skew`; a worker's response carries no `Set-Cookie`), so
 * a pin from an earlier page can send this build's file to a deploy that never had it. Such a miss is asked again
 * without credentials, which reaches the live deploy, which also serves the previous deploys' files
 * (`retain-previous-assets.mts`): what the shell's own cookie expiry would have done.
 *
 * @param request - The request as sent.
 * @param response - The network's answer to it.
 * @param fetchFile - The network.
 * @returns The answer, or the unpinned retry's when the first was a miss.
 */
export const retryUnpinnedMiss = async (
  request: Request,
  response: Response,
  fetchFile: (input: string, init: RequestInit) => Promise<Response>,
): Promise<Response> => {
  if (response.ok || request.credentials === 'omit') {
    return response;
  }
  return fetchFile(request.url, { credentials: 'omit' });
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
 * @param error - The install's rejection, or `undefined` when it completed.
 * @returns The message.
 */
export const installMessage = (error?: unknown): ServiceWorkerMessage =>
  error === undefined
    ? { type: serviceWorkerMessageType, status: 'ready' }
    : {
        type: serviceWorkerMessageType,
        status: isQuotaError(error) ? 'quota-exceeded' : 'failed',
        detail: describeError(error),
      };
