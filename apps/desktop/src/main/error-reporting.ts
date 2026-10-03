/**
 * Sentry error reporting for the desktop main process (launch gate OBS-7).
 *
 * Reports main-process exceptions and native crashes of the renderer and utility processes, which Electron writes
 * as minidumps the SDK uploads from main. No tracing, no default PII, and no user or request on any event.
 *
 * Inert unless the release build set `SENTRY_DSN` (baked in as `tauSentryDsn` by `electron.vite.config.ts`, from
 * the `desktop` GitHub environment); local and unsigned builds report nothing.
 */
import * as Sentry from '@sentry/electron/main';
import type { ErrorEvent } from '@sentry/electron/main';

/**
 * Drop the user and request an event could carry.
 *
 * @param event - The event the SDK is about to send.
 * @returns The scrubbed event.
 */
export const scrubDesktopEvent = (event: ErrorEvent): ErrorEvent => {
  delete event.user;
  delete event.request;
  return event;
};

if (tauSentryDsn) {
  Sentry.init({
    dsn: tauSentryDsn,
    environment: 'production',
    sendDefaultPii: false,
    beforeSend: scrubDesktopEvent,
  });
}
