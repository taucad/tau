/**
 * Main-process failure signals sent to Sentry beside the local diagnostics log (browser observability SB11).
 *
 * `@sentry/electron` already reports, from its child-process integration, a renderer or utility that exits
 * `abnormal-exit`, `launch-failed` or `integrity-failure`, and a `crashed` process through its minidump. It only
 * leaves breadcrumbs for `oom` and `killed`, and it does not see renderer hangs, a failed load of the app's own
 * document, or updater failures. Those are the signals here, so none is reported twice.
 *
 * Builders are pure; `error-reporting.ts` sends what they build.
 */

/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names are snake_case. */

/** One message event, as `Sentry.captureMessage` takes it. */
export type DesktopSignal = {
  readonly message: string;
  readonly level: 'error' | 'warning';
  readonly fingerprint: readonly string[];
  readonly tags: Readonly<Record<string, string>>;
  readonly contexts?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
};

/** Renderer exit reasons this module reports; the SDK reports the others it cares about. */
const reportedGoneReasons: ReadonlySet<string> = new Set(['oom', 'killed']);

/**
 * The event for a renderer that went away, when the SDK would not already report it.
 *
 * @param details - Electron's `render-process-gone` details.
 * @returns The signal, or `undefined` for a clean exit or a reason the SDK reports itself.
 */
export const rendererGoneSignal = (details: unknown): DesktopSignal | undefined => {
  if (typeof details !== 'object' || details === null) {
    return undefined;
  }
  const { reason, exitCode } = details as { reason?: unknown; exitCode?: unknown };
  if (typeof reason !== 'string' || !reportedGoneReasons.has(reason)) {
    return undefined;
  }
  return {
    message: `Renderer gone: ${reason}`,
    level: 'error',
    fingerprint: ['desktop-renderer-gone', reason],
    tags: { reason, ...(typeof exitCode === 'number' ? { exit_code: String(exitCode) } : {}) },
  };
};

/** Milliseconds: a renderer hang this long or shorter is not reported. */
export const rendererHangThreshold = 5000;

/**
 * The event for a renderer hang that ended, once it lasted longer than {@link rendererHangThreshold}.
 *
 * @param duration - Milliseconds the window was unresponsive.
 * @returns The signal, or `undefined` for a short hang.
 */
export const rendererHangSignal = (duration: number): DesktopSignal | undefined =>
  duration <= rendererHangThreshold
    ? undefined
    : {
        message: 'Renderer unresponsive',
        level: 'warning',
        fingerprint: ['desktop-renderer-hang'],
        tags: { hang_seconds: String(Math.round(duration / 1000)) },
        contexts: { hang: { milliseconds: Math.round(duration) } },
      };

/** Chromium's `ERR_ABORTED`: a load replaced by another, not a failure. */
const abortedLoad = -3;

/**
 * The event for a failed load of the window's own document.
 *
 * @param load - The `did-fail-load` arguments that matter.
 * @returns The signal, or `undefined` for a subframe or an aborted load.
 */
export const appLoadFailureSignal = (load: {
  readonly errorCode: unknown;
  readonly errorDescription: unknown;
  readonly url: unknown;
  readonly isMainFrame: unknown;
}): DesktopSignal | undefined => {
  if (load.isMainFrame !== true || load.errorCode === abortedLoad) {
    return undefined;
  }
  const code = typeof load.errorCode === 'number' ? String(load.errorCode) : 'unknown';
  const description = typeof load.errorDescription === 'string' ? load.errorDescription : 'unknown';
  let scheme = 'unknown';
  try {
    scheme = new URL(String(load.url)).protocol.replace(/:$/u, '');
  } catch {
    // The URL is only used for its scheme; a malformed one is reported without it.
  }
  return {
    message: `App document failed to load: ${description}`,
    level: 'error',
    fingerprint: ['desktop-app-load-failed', code],
    tags: { error_code: code, url_scheme: scheme },
  };
};

/** Longest updater failure text an event carries. */
const failureTextLimit = 200;

/**
 * An updater failure's text as an event may carry it: a home directory replaced by `~`, so no account name leaves
 * the machine, and cut to {@link failureTextLimit} characters.
 *
 * @param text - The failure text.
 * @returns The scrubbed text.
 */
export const scrubFailureText = (text: string): string =>
  text.replaceAll(/(?:[a-z]:)?[\\/](?:users|home)[\\/][^\\/:'"\r\n]+/giu, '~').slice(0, failureTextLimit);

/** The updater log events that are failures worth an event. */
const updaterFailureEvents: Readonly<Record<string, 'check-or-download' | 'restart'>> = {
  'updater.error': 'check-or-download',
  'updater.restart-failed': 'restart',
};

/**
 * The event for an updater failure the updater logged.
 *
 * @param event - The updater's log event name.
 * @param detail - Its log detail (`{ message }`).
 * @param update - The channel and version that were updating.
 * @returns The signal, or `undefined` for any other log line.
 */
export const updaterFailureSignal = (
  event: string,
  detail: unknown,
  update: { readonly channel: string; readonly version: string },
): DesktopSignal | undefined => {
  const stage = updaterFailureEvents[event];
  if (stage === undefined) {
    return undefined;
  }
  const message =
    typeof detail === 'object' && detail !== null && typeof (detail as { message?: unknown }).message === 'string'
      ? scrubFailureText((detail as { message: string }).message)
      : 'unknown';
  return {
    message: `Update failed (${stage}): ${message}`,
    level: 'error',
    fingerprint: ['desktop-update-failed', stage],
    tags: { update_stage: stage, update_channel: update.channel, update_from_version: update.version },
  };
};
