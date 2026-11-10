/**
 * Whether this page is hidden, the one answer error reporting and the stale-build recovery both
 * read wherever a report could start waiting (TAU-UI-6). It is derived, not tracked by events: the
 * document's own `visibilityState`, so a document that boots hidden (opened in a background tab) is
 * hidden from the start and stays hidden through its first `pageshow` until the document itself is
 * visible. `pagehide` and `pageshow` only mark what the document's state may not show yet: a page
 * going into the back/forward cache (hidden until it is restored) or going for good (exit).
 */

/** The page as the last `pagehide` or `pageshow` left it. */
let pageTransition: 'shown' | 'cached' | 'exited' = 'shown';

/** The document of this page, read once: it never changes in a browser, and there is none on the server. */
const pageDocument = (globalThis as { readonly document?: Pick<Document, 'visibilityState'> }).document;

/**
 * Whether the page is hidden now: its document is hidden, or a `pagehide` put it in the
 * back/forward cache or took it away and no `pageshow` has restored it since.
 *
 * @returns `true` while nothing on the page may wait, since it may be frozen or discarded.
 */
export const isPageHidden = (): boolean => pageTransition !== 'shown' || pageDocument?.visibilityState === 'hidden';

/**
 * Whether the page is going for good (a `pagehide` the back/forward cache did not keep).
 *
 * @returns `true` once the page has exited.
 */
export const hasPageExited = (): boolean => pageTransition === 'exited';

/**
 * Note a `pagehide`: kept in the back/forward cache (`persisted`) or going for good.
 *
 * @param persisted - The event's `persisted`.
 */
export const notePageHide = (persisted: boolean): void => {
  pageTransition = persisted ? 'cached' : 'exited';
};

/**
 * Note a `pageshow`: the page is no longer in the back/forward cache. It is visible only if its
 * document is ({@link isPageHidden}); a document that boots hidden gets its first `pageshow` hidden.
 */
export const notePageShow = (): void => {
  pageTransition = 'shown';
};
