import { ENV } from '#environment.config.js';
import type * as SentryLibrary from '#lib/sentry.lib.js';

/**
 * Browser error reporting (launch gate OBS-7), loaded only when the host injected `SENTRY_DSN`, so a build without
 * it never downloads the SDK and the first paint never waits for it.
 */
const loadSentry = async (): Promise<typeof SentryLibrary | undefined> => {
  if (!ENV.SENTRY_DSN) {
    return undefined;
  }
  return import('#lib/sentry.lib.js');
};

let started: Promise<typeof SentryLibrary | undefined> | undefined;
let isListening = false;

/**
 * Load and start the SDK once. A failed load (a chunk a deploy stopped serving, a network error) is
 * forgotten, so the next call tries again instead of leaving reporting off for the page.
 */
const start = async (): Promise<{ readonly sentry?: typeof SentryLibrary; readonly failure?: unknown }> => {
  started ??= (async () => {
    const sentry = await loadSentry();
    sentry?.initSentry();
    isListening = sentry !== undefined;
    return sentry;
  })();
  try {
    return { sentry: await started };
  } catch (error) {
    started = undefined;
    return { failure: error };
  }
};

/**
 * Start reporting uncaught errors and unhandled rejections. Never rejects. A failed SDK load goes to
 * `onLoadFailure`, once, as its rejection used to reach the global handler (the entry hands it to
 * the stale-build recovery, since a deploy may have replaced the SDK's own chunk); a later report
 * tries to start again.
 *
 * @param onLoadFailure - Called with the error when the SDK could not be loaded.
 */
export const startErrorReporting = async (onLoadFailure?: (failure: unknown) => void): Promise<void> => {
  const { failure } = await start();
  if (failure !== undefined) {
    onLoadFailure?.(failure);
  }
};

/**
 * Whether Sentry's own global handlers are installed now, so they capture a failure that reaches
 * `window` `error` or `unhandledrejection`. Before that (a failure at boot) nothing does.
 *
 * @returns `true` once error reporting has started with a DSN.
 */
export const isErrorTrackerListening = (): boolean => isListening;

/**
 * Report an error a React or route boundary caught, which never reaches the global handlers. One
 * reported before error reporting has started waits for it, so a failure at boot is not lost; one
 * reported after a failed start tries to start again. Never rejects.
 *
 * @param error - The caught value.
 */
export const reportUiError = async (error: unknown): Promise<void> => {
  const { sentry } = await start();
  sentry?.captureUiError(error);
};
