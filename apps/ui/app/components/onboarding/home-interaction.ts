/**
 * When the person last started using the page: a key press or a pointer press. Home compares it with when it mounted,
 * so typing a password on the sign-in page before home appears does not count, and someone who has begun on home is
 * never pulled into setup. One module-lifetime listener per event, installed when the module loads in a browser.
 *
 * Focus alone is not use. Home's composer takes focus by itself when it mounts, and hands it from the served input to
 * the editor once that loads; a person who focuses the composer does so with a key or a pointer, which already count.
 * What the listeners cannot see, text typed into the served input before the bundle ran, is reported with
 * {@link markPageUsed}.
 */

let lastUsedAt: number | undefined;

/** Record that the person used the page now, for use the listeners could not see. */
export const markPageUsed = (): void => {
  lastUsedAt = performance.now();
};

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', markPageUsed, { capture: true, passive: true });
  document.addEventListener('pointerdown', markPageUsed, { capture: true, passive: true });
}

/**
 * Whether the person pressed a key or a pointer, or typed before the bundle ran, after a moment.
 *
 * @param since - The moment, on the `performance.now()` clock, such as when home mounted.
 * @returns Whether the page has been used since then.
 */
export const hasUsedPageSince = (since: number): boolean => lastUsedAt !== undefined && lastUsedAt > since;
