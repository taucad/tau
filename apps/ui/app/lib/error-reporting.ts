import { ENV } from '#environment.config.js';
import type * as SentryLibrary from '#lib/sentry.lib.js';
import { sendSentryEventDirectly } from '#lib/sentry-event.lib.js';
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
/** Whether this page's only load failed: errors go out without the SDK from then on. */
let hasLoadFailed = false;

/** Errors handed over (captured, waiting for the load, or sent without the SDK): a second report is a no-op. */
const reported = new WeakSet();
/** Errors waiting for the SDK's load, in the order reported. */
let waitingForLoad: unknown[] = [];
/** Errors whose event without the SDK waits for their tags to settle. */
const waitingForTags = new Set<unknown>();
/** Errors sent without the SDK, once per page each. */
const sentDirectly = new WeakSet();
/** Errors reported beyond the limit while the SDK was loading; logged once it settles. */
let droppedWhileLoading = 0;
/** Tags for reported values, from whoever knows them (the stale-build recovery's `stale_build`). */
let describer: ErrorDescriber = { now: () => ({}), settled: async () => ({}) };

/** Send one error without the SDK, once per page; a value that cannot be remembered is sent each time. */
const sendDirectly = (error: unknown, tags: Readonly<Record<string, string>>): void => {
  waitingForTags.delete(error);
  if (isWeakKey(error)) {
    if (sentDirectly.has(error)) {
      return;
    }
    sentDirectly.add(error);
  }
  // async-iife: bootstrap -- the event goes on its own; a refused request is simply lost.
  void sendSentryEventDirectly(error, tags);
};

/** Send an error without the SDK once its tags settle, unless the page going sent it first. */
const sendDirectlyWhenTagged = async (error: unknown): Promise<void> => {
  waitingForTags.add(error);
  const tags = await describer.settled(error);
  if (waitingForTags.has(error)) {
    sendDirectly(error, tags);
  }
};

const warnDropped = (): void => {
  if (droppedWhileLoading > 0) {
    console.warn(`[error-reporting] ${String(droppedWhileLoading)} errors were dropped while the SDK was loading`);
    droppedWhileLoading = 0;
  }
};

/** Start the SDK once per page; hand it what waited, or send that without it when the load fails. */
const start = async (): Promise<{ readonly sentry?: typeof SentryLibrary; readonly failure?: unknown }> => {
  started ??= (async () => {
    try {
      const sentry = await loadSentry();
      sentry?.initSentry();
      liveSentry = sentry;
      for (const error of waitingForLoad.splice(0)) {
        sentry?.captureUiError(error);
      }
      warnDropped();
      return { sentry };
    } catch (error) {
      hasLoadFailed = true;
      const waiting = waitingForLoad.splice(0);
      warnDropped();
      // Not awaited: the load's outcome is known now; each event goes once its tags settle.
      for (const waited of waiting) {
        void sendDirectlyWhenTagged(waited);
      }
      return { failure: error };
    }
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
 * The page is going: send every error still waiting (for the SDK's load, or for its tags) now,
 * without the SDK and with the tags known now, since nothing on this page will send them later.
 */
export const sendWaitingErrors = (): void => {
  for (const error of [...waitingForLoad.splice(0), ...waitingForTags]) {
    sendDirectly(error, describer.now(error));
  }
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
    liveSentry.captureUiError(error);
    return;
  }
  if (hasLoadFailed) {
    markReported();
    await sendDirectlyWhenTagged(error);
    return;
  }
  if (waitingForLoad.length >= unreportedErrorLimit) {
    droppedWhileLoading += 1;
    return;
  }
  markReported();
  waitingForLoad = [...waitingForLoad, error];
  // Starts this page's only load when nothing has; the error goes with what it does.
  await start();
};
