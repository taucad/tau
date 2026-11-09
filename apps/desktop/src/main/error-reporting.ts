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
import type { DesktopSignal } from '#main/desktop-signals.js';

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
      /* The release workflow's one name per tag, which desktop-promote gives its commits; never `Tau-Staging@<version>`. */
      ...(tauSentryRelease ? { release: tauSentryRelease } : {}),
      sendDefaultPii: false,
      beforeSend: scrubDesktopEvent,
      /* Renderer events arrive over IPC from the preload's own hookup (SB11): no privileged `sentry-ipc://` scheme
       * that bypasses the page's CSP, and no injected preload, which cannot be found in a bundled main anyway. */
      ipcMode: Sentry.IPCMode.Classic,
      integrations: (defaults) => defaults.filter((integration) => integration.name !== 'PreloadInjection'),
    });
  }
};

/**
 * What the renderer needs to report its own errors through main (SB11): the DSN that gates its SDK, only once main's
 * SDK is running to receive them. The renderer never posts to it; its events cross IPC and leave from main.
 *
 * @returns `{ SENTRY_DSN }` for the renderer's `window.ENV`, or nothing.
 */
export const rendererErrorReportingEnvironment = (): { readonly SENTRY_DSN?: string } =>
  // eslint-disable-next-line @typescript-eslint/naming-convention -- An environment name.
  tauSentryDsn && Sentry.isInitialized() ? { SENTRY_DSN: tauSentryDsn } : {};

/**
 * Send one main-process failure signal (SB11), beside the local diagnostics log. A no-op while Sentry is not
 * initialized, and for no signal.
 *
 * @param signal - The signal a `desktop-signals.ts` builder made, if any.
 */
export const reportDesktopSignal = (signal: DesktopSignal | undefined): void => {
  if (signal === undefined || !Sentry.isInitialized()) {
    return;
  }
  Sentry.captureMessage(signal.message, {
    level: signal.level,
    fingerprint: [...signal.fingerprint],
    tags: signal.tags,
    ...(signal.contexts === undefined ? {} : { contexts: signal.contexts }),
  });
};
