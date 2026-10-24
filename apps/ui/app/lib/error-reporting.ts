import { ENV } from '#environment.config.js';
import type * as SentryLibrary from '#lib/sentry.lib.js';
import { sendSentryEventDirectly, sendSentryEventsAtPageExit } from '#lib/sentry-event.lib.js';
import { isWeakKey } from '#lib/weak-key.js';

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

/** Errors reported while the SDK is loading kept for it, at most. */
export const unreportedErrorLimit = 50;

/** Tags for a reported value: what is known now, and once its decision settles (bounded). */
export type ErrorDescriber = {
  readonly now: (error: unknown) => Readonly<Record<string, string>>;
  readonly settled: (error: unknown) => Promise<Readonly<Record<string, string>>>;
};

/**
 * The one load of the SDK this page makes. A failed load is not retried on the same page: whether a
 * browser fetches a failed module again differs (the HTML spec cached the failure in the module map
 * until whatwg/html#10327, July 2026, and engines move at their own pace), and the usual cause here,
 * a deploy that stopped serving the SDK's chunk, would fail again anyway. Errors reported after it
 * are sent without the SDK (`sendSentryEventDirectly`).
 */
let started: Promise<{ readonly sentry?: typeof SentryLibrary; readonly failure?: unknown }> | undefined;
/** The SDK once it has started on this page; captures go straight to it from then on. */
let liveSentry: typeof SentryLibrary | undefined;
/** Whether the SDK cannot be used on this page (its load or start failed): errors go out without it. */
let isSdkUnavailable = false;

/** One call of {@link reportUiError}: the same value reported twice (a thrown string) is two reports. */
type Report = { readonly error: unknown };

/** Errors handed over (captured, waiting for the load, or sent without the SDK): a second report is a no-op. */
const reported = new WeakSet();
/** Reports waiting for the SDK's load, in the order made. */
let waitingForLoad: Report[] = [];
/** Reports whose event without the SDK waits for their tags to settle. */
const waitingForTags = new Set<Report>();
/** Reports sent without the SDK: each is sent once. */
const sentDirectly = new WeakSet<Report>();
/** Errors reported beyond the limit while the SDK was loading; logged once it settles. */
let droppedWhileLoading = 0;
/** Whether the SDK has already thrown once on this page (logged once, never reported). */
let hasLoggedSdkThrow = false;
/** Tags for reported values, from whoever knows them (the stale-build recovery's `stale_build`). */
let describer: ErrorDescriber = { now: () => ({}), settled: async () => ({}) };

/** Send one report without the SDK, once. */
const sendDirectly = (report: Report, tags: Readonly<Record<string, string>>): void => {
  waitingForTags.delete(report);
  if (sentDirectly.has(report)) {
    return;
  }
  sentDirectly.add(report);
  // async-iife: bootstrap -- the event goes on its own; a refused request is simply lost.
  void sendSentryEventDirectly(report.error, tags);
};

/** Send a report without the SDK once its tags settle, unless the page being hidden sent it first. */
const sendDirectlyWhenTagged = async (report: Report): Promise<void> => {
  waitingForTags.add(report);
  const tags = await describer.settled(report.error);
  if (waitingForTags.has(report)) {
    sendDirectly(report, tags);
  }
};

const warnDropped = (): void => {
  if (droppedWhileLoading > 0) {
    console.warn(`[error-reporting] ${String(droppedWhileLoading)} errors were dropped while the SDK was loading`);
    droppedWhileLoading = 0;
  }
};

/** The SDK threw after it loaded (in its start or a capture): not a load failure; logged once, never reported. */
const logSdkThrow = (error: unknown): void => {
  if (!hasLoggedSdkThrow) {
    hasLoggedSdkThrow = true;
    console.error('[error-reporting] the error tracker threw', error);
  }
};

/** Capture one error with the SDK; a capture that throws costs only that error. */
const capture = (sentry: typeof SentryLibrary, reportedError: unknown): void => {
  try {
    sentry.captureUiError(reportedError);
  } catch (error) {
    logSdkThrow(error);
  }
};

/** The SDK cannot be used: what waited for it goes without it, each once its tags settle. */
const sendWaitingWithoutSdk = (): void => {
  isSdkUnavailable = true;
  warnDropped();
  for (const report of waitingForLoad.splice(0)) {
    // async-iife: bootstrap -- each event goes once its tags settle; the load's outcome is known now.
    void sendDirectlyWhenTagged(report);
  }
};

/**
 * Start the SDK once per page and hand it what waited. Only the import failing is a load failure
 * (`failure`); the SDK throwing as it starts leaves it unusable, logged once, and is not.
 */
const start = async (): Promise<{ readonly sentry?: typeof SentryLibrary; readonly failure?: unknown }> => {
  started ??= (async () => {
    let sentry: typeof SentryLibrary | undefined;
    try {
      sentry = await loadSentry();
    } catch (error) {
      sendWaitingWithoutSdk();
      return { failure: error };
    }
    try {
      sentry?.initSentry();
    } catch (error) {
      logSdkThrow(error);
      // Half-started: the client may be bound with its global handlers installed; turn it off first.
      try {
        sentry?.stopSentry();
      } catch {
        // Nothing more can be undone.
      }
      sendWaitingWithoutSdk();
      return {};
    }
    liveSentry = sentry;
    for (const report of waitingForLoad.splice(0)) {
      if (sentry !== undefined) {
        capture(sentry, report.error);
      }
    }
    warnDropped();
    return { sentry };
  })();
  return started;
};

/**
 * Start reporting uncaught errors and unhandled rejections. Never rejects. The SDK is loaded once
 * per page: a failed load goes to `onLoadFailure`, once, as its rejection used to reach the global
 * handler (the entry hands it to the stale-build recovery, since a deploy may have replaced the
 * SDK's own chunk), and errors reported from then on are sent without the SDK.
 *
 * @param onLoadFailure - Called with the error when the SDK could not be loaded.
 */
export const startErrorReporting = async (onLoadFailure?: (failure: unknown) => void): Promise<void> => {
  const isFirst = started === undefined;
  const { failure } = await start();
  if (isFirst && failure !== undefined) {
    onLoadFailure?.(failure);
  }
};

/**
 * Whether Sentry's own global handlers are installed now, so they capture a failure that reaches
 * `window` `error` or `unhandledrejection`. Before that (a failure at boot) nothing does.
 *
 * @returns `true` once error reporting has started with a DSN.
 */
export const isErrorTrackerListening = (): boolean => liveSentry !== undefined;

/**
 * Tag errors sent without the SDK with what the caller knows of them (the stale-build recovery's
 * `stale_build`), as `beforeSend` tags the SDK's own events.
 *
 * @param next - Tags for one reported value, now and once settled.
 */
export const setErrorDescriber = (next: ErrorDescriber): void => {
  describer = next;
};

/**
 * The page is hidden (every `pagehide`, kept in the back/forward cache or not, since a frozen page
 * may be evicted without running again): the errors still waiting, for the SDK's load or for their
 * tags, go now without the SDK, with the tags known now, as far as the page-exit budget allows
 * (`sendSentryEventsAtPageExit`: newest first, stacks trimmed, the rest counted in one summary
 * event). None is sent again; errors reported after the page is shown again are handled as usual.
 */
export const sendWaitingErrors = (): void => {
  const waiting = [...waitingForLoad.splice(0), ...waitingForTags].filter((report) => !sentDirectly.has(report));
  waitingForTags.clear();
  for (const report of waiting) {
    sentDirectly.add(report);
  }
  sendSentryEventsAtPageExit(waiting.map((report) => ({ error: report.error, tags: describer.now(report.error) })));
};

/**
 * Report an error a React or route boundary caught, which never reaches the global handlers, once
 * per page. Captured by the SDK when it is up; kept for it while it loads (at most
 * {@link unreportedErrorLimit}); sent without it once its load failed, or when the page goes before
 * it loads. Nothing is stored on the device. An error is marked reported only once it is captured,
 * kept or sent, so one dropped while the SDK loads can be reported again. Never rejects.
 *
 * @param error - The caught value.
 */
export const reportUiError = async (error: unknown): Promise<void> => {
  if (!ENV.SENTRY_DSN || (isWeakKey(error) && reported.has(error))) {
    return;
  }
  const markReported = (): void => {
    if (isWeakKey(error)) {
      reported.add(error);
    }
  };
  if (liveSentry !== undefined) {
    markReported();
    capture(liveSentry, error);
    return;
  }
  if (isSdkUnavailable) {
    markReported();
    await sendDirectlyWhenTagged({ error });
    return;
  }
  if (waitingForLoad.length >= unreportedErrorLimit) {
    droppedWhileLoading += 1;
    return;
  }
  markReported();
  waitingForLoad = [...waitingForLoad, { error }];
  // Starts this page's only load when nothing has; the error goes with what it does.
  await start();
};
