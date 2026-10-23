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

/** Start reporting uncaught errors and unhandled rejections. */
export const startErrorReporting = async (): Promise<void> => {
  started ??= (async () => {
    const sentry = await loadSentry();
    sentry?.initSentry();
    isListening = sentry !== undefined;
    return sentry;
  })();
  await started;
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
 * reported before error reporting has started waits for it, so a failure at boot is not lost.
 *
 * @param error - The caught value.
 */
export const reportUiError = async (error: unknown): Promise<void> => {
  const sentry = await (started ?? loadSentry());
  sentry?.captureUiError(error);
};
