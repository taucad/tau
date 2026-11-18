/**
 * Version-skew navigation for a tab a deploy replaced (TAU-UI-S).
 *
 * A tab keeps running the build it loaded. Once a deploy replaces that build and its
 * chunks age out of the retained assets (`scripts/retain-previous-assets.mts`), the next
 * client navigation imports a route module the server no longer serves. React Router's own
 * guard (a `/__manifest` version mismatch turns the navigation into a document load) never
 * runs here: route discovery is eager (`routeDiscovery: { mode: 'initial' }` in
 * `react-router.config.ts`), so every route is known on boot and no navigation asks `/__manifest`.
 *
 * So the tab asks the server which build is live before it matters (the SvelteKit
 * `version.pollInterval` pattern), through `build-skew`, the one owner of that answer:
 * when it is shown again after {@link hiddenRecheckAfter} hidden or restored from the
 * back/forward cache, and every {@link visiblePollInterval} while visible
 * ({@link installLiveBuildChecks}). While the server's verdict is `replaced`, the root route's
 * client middleware ({@link staleBuildMiddleware}, React Router 8 migration RR9) ends every
 * client navigation to another page with `redirectDocument`, so the router loads the destination
 * as a document, into the live build, instead of rendering it on this one; the router keeps the
 * navigation's own `replace`. Back/forward, same-page navigations, fetchers, revalidations and
 * submissions stay with the router; `location.state` does not survive a document load. A route
 * module that fails to load is caught by the React Router patch
 * (`tools/pnpm/patches/react-router@8.5.1.patch`), which loads the destination instead of
 * reloading the page being left.
 *
 * A navigation is never a loop: each document load lands on the build the server names.
 */

import { redirectDocument } from 'react-router';
import type { DataStrategyResult, MiddlewareFunction } from 'react-router';
import { buildId, queryLiveBuild, readServerVerdict } from '#filesystem/build-skew.js';
import { isPageHidden } from '@taucad/ui-core/lib/page-visibility';

/** Milliseconds a tab must have been hidden before being shown again asks the server. */
export const hiddenRecheckAfter = 60_000;

/** Milliseconds between the server checks a visible tab makes on its own. */
export const visiblePollInterval = 5 * 60_000;

/** A client middleware of the root route. */
type ClientMiddleware = MiddlewareFunction<Record<string, DataStrategyResult>>;

/**
 * What started the router call. React Router hands client middleware the arguments of its data
 * strategy, `matches` aside, so this experimental data-strategy field reaches it untyped.
 */
type Initiator = 'initialization' | 'navigation' | 'fetcher' | 'revalidation' | 'static';

const readInitiator = (args: Parameters<ClientMiddleware>[0]): Initiator | undefined =>
  (args as { readonly unstable_initiator?: Initiator }).unstable_initiator;

/** The path and query string of a submission whose action ran, until its own navigation loads. */
let submittedPath: string | undefined;

/**
 * The document URL for a router navigation that should load as a document: a GET of another page
 * of this origin.
 *
 * @param request - The router's request: the destination with no hash.
 * @param url - The destination as the router normalised it, hash included.
 * @param here - The page's location; on back/forward it is already the destination.
 * @returns The path, search and hash to load, or `undefined` to leave the navigation to the router.
 */
export const documentHrefFor = (request: Request, url: URL, here: Location): string | undefined => {
  if (request.method !== 'GET') {
    return undefined;
  }
  const destination = new URL(request.url);
  if (destination.origin !== here.origin) {
    return undefined;
  }
  if (destination.pathname === here.pathname && destination.search === here.search) {
    return undefined;
  }
  return `${destination.pathname}${destination.search}${url.hash}`;
};

/**
 * Root client middleware: while the server names another build, a client navigation to another
 * page ends in a document load of that page, which the router performs with the navigation's own
 * `replace`. It never calls `next`, so no loader runs and no data request reaches the new build.
 *
 * @param args - The router's middleware arguments.
 * @returns Nothing: the router then runs the rest of the navigation.
 */
export const staleBuildMiddleware: ClientMiddleware = (args) => {
  const { request, url } = args;
  const initiator = readInitiator(args);
  if (initiator !== undefined && initiator !== 'navigation') {
    return;
  }
  const { pathname, search } = new URL(request.url);
  const path = `${pathname}${search}`;
  if (request.method !== 'GET') {
    // The action runs on the server as usual; the page its navigation then loads stays with the router.
    submittedPath = path;
    return;
  }
  const afterSubmission = submittedPath === path;
  submittedPath = undefined;
  if (afterSubmission || readServerVerdict() !== 'replaced') {
    return;
  }
  const href = documentHrefFor(request, url, globalThis.location);
  if (href !== undefined) {
    // oxlint-disable-next-line @typescript-eslint/only-throw-error -- React Router pattern: middleware throws a redirect Response.
    throw redirectDocument(href);
  }
};

/**
 * Ask the server about the live build at the moments that matter, so {@link staleBuildMiddleware}
 * knows the verdict before the next click.
 *
 * @returns A function that removes the listeners and the poll.
 */
export const installLiveBuildChecks = (): (() => void) => {
  if (buildId === 0) {
    // Desktop and `tau serve` bundles have no build id: there is no server to ask.
    return () => undefined;
  }
  let hiddenSince: number | undefined = isPageHidden() ? Date.now() : undefined;
  const ask = (): void => {
    // A listener cannot await; the middleware reads the verdict at the next navigation.
    void queryLiveBuild();
  };
  const onVisibilityChange = (): void => {
    if (isPageHidden()) {
      hiddenSince ??= Date.now();
      return;
    }
    const wasHiddenFor = hiddenSince === undefined ? 0 : Date.now() - hiddenSince;
    hiddenSince = undefined;
    if (wasHiddenFor >= hiddenRecheckAfter) {
      ask();
    }
  };
  const onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      ask();
    }
  };
  const poll = setInterval(() => {
    if (!isPageHidden()) {
      ask();
    }
  }, visiblePollInterval);

  document.addEventListener('visibilitychange', onVisibilityChange);
  globalThis.addEventListener('pageshow', onPageShow);
  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    globalThis.removeEventListener('pageshow', onPageShow);
    clearInterval(poll);
  };
};
