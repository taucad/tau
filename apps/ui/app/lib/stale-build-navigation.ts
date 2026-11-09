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
 * back/forward cache, and every {@link visiblePollInterval} while visible. While the server's
 * verdict is `replaced`, the router's `navigate` (which `<Link>` and `useNavigate` both call)
 * loads an absolute in-app destination as a document, into the live build, instead of
 * importing its route module; `replace` navigations replace. Click handlers, analytics and
 * submissions are untouched; `location.state` does not survive a document load. A relative or
 * numeric destination stays with the router; a route module that then fails to load is
 * caught by the React Router patch (`tools/pnpm/patches/react-router@7.18.2.patch`), which loads
 * the destination instead of reloading the page being left.
 *
 * A navigation is never a loop: each document load lands on the build the server names.
 */

import { buildId, queryLiveBuild, readServerVerdict, subscribeServerVerdict } from '#filesystem/build-skew.js';
import { isPageHidden } from '#lib/page-visibility.js';

/** Milliseconds a tab must have been hidden before being shown again asks the server. */
export const hiddenRecheckAfter = 60_000;

/** Milliseconds between the server checks a visible tab makes on its own. */
export const visiblePollInterval = 5 * 60_000;

/** The part of React Router's data router (`window.__reactRouterDataRouter`) this module wraps. */
type DataRouter = { navigate: (to: unknown, options?: NavigateOptions) => Promise<void> };
type NavigateOptions = { readonly replace?: boolean; readonly formData?: unknown; readonly body?: unknown };

const readRouter = (): DataRouter | undefined =>
  (globalThis as { readonly __reactRouterDataRouter?: DataRouter }).__reactRouterDataRouter;

/**
 * The document URL for a router navigation that should load as a document: an absolute
 * in-app path (a string, or a `{ pathname, search, hash }` object) to another page.
 *
 * @param to - What `navigate` was called with.
 * @param options - Its options.
 * @param here - The page's location.
 * @returns The path, search and hash to load, or `undefined` to leave the navigation to the router.
 */
export const documentHrefFor = (
  to: unknown,
  options: NavigateOptions | undefined,
  here: Location,
): string | undefined => {
  if (options?.formData !== undefined || options?.body !== undefined) {
    return undefined;
  }
  let path: string;
  if (typeof to === 'string') {
    path = to;
  } else if (typeof to === 'object' && to !== null) {
    const {
      pathname = here.pathname,
      search = '',
      hash = '',
    } = to as Partial<Record<'pathname' | 'search' | 'hash', string>>;
    path = `${pathname}${search}${hash}`;
  } else {
    return undefined;
  }
  if (!path.startsWith('/') || path.startsWith('//')) {
    return undefined;
  }
  const url = new URL(path, here.origin);
  if (url.pathname === here.pathname && url.search === here.search) {
    return undefined;
  }
  return `${url.pathname}${url.search}${url.hash}`;
};

/**
 * Ask the server about the live build at the moments that matter, and load router navigations
 * as documents while it names another build.
 *
 * @returns A function that removes the listeners, the poll and the router wrapper.
 */
export const installStaleBuildNavigation = (): (() => void) => {
  if (buildId === 0) {
    // Desktop and `tau serve` bundles have no build id: there is no server to ask.
    return () => undefined;
  }
  let hiddenSince: number | undefined = isPageHidden() ? Date.now() : undefined;
  let wrapped: { readonly router: DataRouter; readonly navigate: DataRouter['navigate'] } | undefined;
  const unwrap = (): void => {
    if (wrapped !== undefined) {
      wrapped.router.navigate = wrapped.navigate;
      wrapped = undefined;
    }
  };
  const followVerdict = (): void => {
    const router = readRouter();
    if (readServerVerdict() !== 'replaced' || router === undefined) {
      unwrap();
      return;
    }
    if (wrapped !== undefined) {
      return;
    }
    const { navigate } = router;
    wrapped = { router, navigate };
    router.navigate = async (to, options) => {
      const href = documentHrefFor(to, options, globalThis.location);
      if (href === undefined) {
        return navigate.call(router, to, options);
      }
      if (options?.replace === true) {
        globalThis.location.replace(href);
      } else {
        globalThis.location.assign(href);
      }
      // The page is leaving: nothing that awaits this navigation should run on the old build.
      return new Promise<void>(() => {
        // Never settles.
      });
    };
  };
  const ask = (): void => {
    // async-iife: bootstrap -- a listener cannot await. The router may only exist once the page has hydrated.
    void (async () => {
      await queryLiveBuild();
      followVerdict();
    })();
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

  const unsubscribe = subscribeServerVerdict(followVerdict);
  followVerdict();

  document.addEventListener('visibilitychange', onVisibilityChange);
  globalThis.addEventListener('pageshow', onPageShow);
  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    globalThis.removeEventListener('pageshow', onPageShow);
    clearInterval(poll);
    unsubscribe();
    unwrap();
  };
};
