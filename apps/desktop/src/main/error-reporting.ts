/**
 * Sentry error reporting for the desktop main process (launch gate OBS-7).
 *
 * Reports main-process exceptions and native crashes of the renderer and utility processes, which Electron writes
 * as minidumps the SDK uploads from main. No tracing, no default PII, and no user or request on any event.
 *
 * Inert unless the release build set `SENTRY_DSN` (baked in as `tauSentryDsn` by `electron.vite.config.ts`, from
 * the `desktop` or `desktop-staging` GitHub environment); local and unsigned builds report nothing.
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

/**
 * Start crash reporting after profile selection and pristine qualification admission, before any windows or utilities.
 *
 * An automated run (a route qualification, or a package assembled to honour test overrides) reports under
 * `<channel>-e2e`, so the crashes a suite causes on purpose never land among real users' (TAU-DESKTOP-5).
 *
 * @param channel - The channel from the packaged application manifest.
 * @param automated - Whether a test harness launched this process.
 */
export const initializeDesktopErrorReporting = (channel: 'staging' | 'production', automated = false): void => {
  if (tauSentryDsn) {
    Sentry.init({
      dsn: tauSentryDsn,
      environment: automated ? `${channel}-e2e` : channel,
      sendDefaultPii: false,
      beforeSend: scrubDesktopEvent,
    });
  }
};
