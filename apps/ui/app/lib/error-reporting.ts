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

/** Start reporting uncaught errors and unhandled rejections. */
export const startErrorReporting = async (): Promise<void> => {
  const sentry = await loadSentry();
  sentry?.initSentry();
};

/**
 * Report an error a React or route boundary caught, which never reaches the global handlers.
 *
 * @param error - The caught value.
 */
export const reportUiError = async (error: unknown): Promise<void> => {
  const sentry = await loadSentry();
  sentry?.captureUiError(error);
};
