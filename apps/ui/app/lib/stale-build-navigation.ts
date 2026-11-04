/**
 * Version-skew navigation for a tab a deploy replaced (TAU-UI-S).
 *
 * A tab keeps running the build it loaded. Once a deploy replaces that build and its
 * chunks age out of the retained assets (`scripts/retain-previous-assets.mts`), the next
 * client navigation imports a route module the server no longer serves; React Router then
 * reloads the page being left, not the one asked for. React Router's own guard (a
 * `/__manifest` version mismatch turns the navigation into a document load) only covers
 * routes not yet discovered, and every linked route is discovered when its link renders.
 *
 * So the tab asks the server which build is live before it matters (the SvelteKit
 * `version.pollInterval` pattern), through `build-skew`, the one owner of that answer:
 * when it turns visible after {@link hiddenRecheckAfter} hidden, and every
 * {@link visiblePollInterval} while visible. Once the server's verdict is `replaced`, a
 * click on an in-app link leaves the router: the click is kept from React (so `<Link>`
 * does not route it) and the browser loads the destination as a document, into the live
 * build. A programmatic `navigate()` is not covered; a route module that then fails to
 * load is caught by the React Router patch (`tools/pnpm/patches/react-router@7.18.2.patch`),
 * which loads the destination instead of reloading the page being left.
 *
 * A user's click is never a loop: each document load lands on the build the server names.
 */

import { queryLiveBuild, readServerVerdict } from '#filesystem/build-skew.js';

/** Milliseconds a tab must have been hidden before turning visible asks the server again. */
export const hiddenRecheckAfter = 60_000;

/** Milliseconds between the server checks a visible tab makes on its own. */
export const visiblePollInterval = 5 * 60_000;

/**
 * Whether `event`, a click on `anchor`, is an in-app navigation the router would handle that
 * should load as a document instead: the browser's own default (same tab, same origin, plain
 * primary click) to another page, not a hash jump on this one.
 *
 * @param event - The click.
 * @param anchor - The link it landed on.
 * @param here - The page's location.
 * @returns `true` when the click should leave the router.
 */
export const isDocumentNavigation = (event: MouseEvent, anchor: HTMLAnchorElement, here: Location): boolean => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }
  if ((anchor.target !== '' && anchor.target !== '_self') || anchor.hasAttribute('download')) {
    return false;
  }
  if (anchor.origin !== here.origin) {
    return false;
  }
  return anchor.pathname !== here.pathname || anchor.search !== here.search;
};

/**
 * Ask the server about the live build at the moments that matter, and load in-app links as
 * documents once it names another build.
 *
 * @returns A function that removes the listeners and the poll.
 */
export const installStaleBuildNavigation = (): (() => void) => {
  let hiddenSince: number | undefined = document.visibilityState === 'hidden' ? Date.now() : undefined;
  const ask = (): void => {
    // async-iife: bootstrap -- a listener cannot await; the verdict is read at the next click.
    void queryLiveBuild();
  };
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      hiddenSince ??= Date.now();
      return;
    }
    const wasHiddenFor = hiddenSince === undefined ? 0 : Date.now() - hiddenSince;
    hiddenSince = undefined;
    if (wasHiddenFor >= hiddenRecheckAfter) {
      ask();
    }
  };
  const poll = setInterval(() => {
    if (document.visibilityState === 'visible') {
      ask();
    }
  }, visiblePollInterval);
  // Capture on `window` runs before React's listeners on its root, so stopping the click here keeps it from `<Link>`.
  const onClick = (event: MouseEvent): void => {
    if (readServerVerdict() !== 'replaced' || !(event.target instanceof Element)) {
      return;
    }
    const anchor = event.target.closest('a[href]');
    if (anchor instanceof HTMLAnchorElement && isDocumentNavigation(event, anchor, globalThis.location)) {
      event.stopPropagation();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  globalThis.addEventListener('click', onClick, { capture: true });
  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    globalThis.removeEventListener('click', onClick, { capture: true });
    clearInterval(poll);
  };
};
