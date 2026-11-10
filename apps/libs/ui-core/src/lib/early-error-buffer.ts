/**
 * The page's earliest failures (browser observability SB5): `window` `error` and
 * `unhandledrejection` events from before the lazily loaded SDK installs its own handlers. The
 * client entry imports this module first, so its listeners are in place before any other module
 * evaluates; `startErrorReporting` drains what it caught into `reportUiError` once the SDK's load
 * settles, and removes the listeners. It imports nothing, so nothing it depends on can throw first.
 */

/** Failures kept, at most (principle 3); later ones are dropped. */
export const earlyErrorLimit = 20;

/** What the buffer holds: the thrown or rejected values, oldest first. */
let caught: unknown[] = [];
let isListening = false;

const keep = (value: unknown): void => {
  if (caught.length < earlyErrorLimit) {
    caught = [...caught, value];
  }
};

const onError = (event: ErrorEvent): void => {
  // A runtime error has its value; a cross-origin script error only its message.
  keep(event.error ?? event.message);
};

const onRejection = (event: PromiseRejectionEvent): void => {
  keep(event.reason);
};

/**
 * Start buffering. A no-op outside a page and when already buffering.
 *
 * @public
 */
export const startEarlyErrorBuffer = (): void => {
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent in a worker and during SSR.
  if (isListening || globalThis.window === undefined) {
    return;
  }
  isListening = true;
  globalThis.window.addEventListener('error', onError);
  globalThis.window.addEventListener('unhandledrejection', onRejection);
};

/**
 * Stop buffering and hand over what was caught, oldest first; later calls return nothing.
 *
 * @returns The values caught since the buffer started.
 * @public
 */
export const drainEarlyErrors = (): readonly unknown[] => {
  if (isListening) {
    isListening = false;
    globalThis.window.removeEventListener('error', onError);
    globalThis.window.removeEventListener('unhandledrejection', onRejection);
  }
  const drained = caught;
  caught = [];
  return drained;
};

startEarlyErrorBuffer();
