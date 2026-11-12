/**
 * When the person last started using the page: a key press, a pointer press, or focus in a text
 * field such as the composer. Home compares it with when it mounted, so typing a password on the sign-in page before
 * home appears does not count, and someone who has begun on home is never pulled into setup. One module-lifetime
 * listener per event, installed when the module loads in a browser.
 */

let lastUsedAt: number | undefined;

const isTextField = (target: FocusEvent['target']): boolean =>
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLInputElement ||
  (target instanceof HTMLElement && target.isContentEditable);

const markUsed = (): void => {
  lastUsedAt = performance.now();
};

const markFocus = (event: FocusEvent): void => {
  if (isTextField(event.target)) {
    markUsed();
  }
};

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', markUsed, { capture: true, passive: true });
  document.addEventListener('pointerdown', markUsed, { capture: true, passive: true });
  document.addEventListener('focusin', markFocus, { capture: true, passive: true });
}

/**
 * Whether the person pressed a key or a pointer, or focused a text field, after a moment.
 *
 * @param since - The moment, on the `performance.now()` clock, such as when home mounted.
 * @returns Whether the page has been used since then.
 */
export const hasUsedPageSince = (since: number): boolean => lastUsedAt !== undefined && lastUsedAt > since;
