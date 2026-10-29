import { isObservabilityHarnessDirect } from '#lib/observability-harness-context.js';
import { ENV } from '#environment.config.js';
import { drainEarlyErrors } from '#lib/early-error-buffer.js';
import { recordErrorDetails } from '#lib/error-details.js';
import type { ErrorDetails } from '#lib/error-details.js';
import type * as SentryLibrary from '#lib/sentry.lib.js';
import { hasPageExited, isPageHidden } from '#lib/page-visibility.js';
import { sendSentryEventDirectly, sendSentryEventsOnHide } from '#lib/sentry-event.lib.js';
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

/**
 * Errors one page sends without the SDK, at most, those that waited for its load and went as the
 * page was hidden included: the SDK's own deduplication and rate limits are not there, and a
 * boundary that keeps catching new errors (a remount loop) would otherwise post one event each.
 * Every such send is admitted in one place ({@link admitDirect}).
 */
export const directErrorLimit = 100;

/** Tags for a reported value: what is known now, and once its decision settles (bounded). */
export type ErrorDescriber = {
  readonly now: (error: unknown) => Readonly<Record<string, string>>;
  readonly settled: (error: unknown) => Promise<Readonly<Record<string, string>>>;
};

/** How the SDK's one load ended: the SDK when it started, the import's error when it failed. */
type LoadOutcome = { readonly sentry?: typeof SentryLibrary; readonly failure?: unknown };

/**
 * The one load of the SDK this page makes. A failed load is not retried on the same page: whether a
 * browser fetches a failed module again differs (the HTML spec cached the failure in the module map
 * until whatwg/html#10327, July 2026, and engines move at their own pace), and the usual cause here,
 * a deploy that stopped serving the SDK's chunk, would fail again anyway. Errors reported after it
 * are sent without the SDK (`sendSentryEventDirectly`).
 */
let started: Promise<LoadOutcome> | undefined;
/** The load's outcome once it is in ({@link isSdkLoadFailure} reads it without waiting). */
let loadOutcome: LoadOutcome | undefined;
/** The SDK once it has started on this page; captures use it from then on. */
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
/** Errors this page has handed to the path without the SDK ({@link directErrorLimit}). */
let directReports = 0;
/** Whether this page has said it dropped errors beyond {@link directErrorLimit} (said once). */
let hasWarnedDirectLimit = false;
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

/**
 * Take one report onto the path without the SDK, unless the page's {@link directErrorLimit} is
 * spent: the one admission point for every send without the SDK. A refusal drops nothing by itself:
 * a hidden page keeps what it refused waiting for the SDK; the caller that drops it says so
 * ({@link warnDirectDropped}).
 */
const admitDirect = (): boolean => {
  if (directReports >= directErrorLimit) {
    return false;
  }
  directReports += 1;
  return true;
};

/** Reports beyond {@link directErrorLimit} were dropped: said once per page, when the first one is. */
const warnDirectDropped = (dropped: number): void => {
  if (dropped > 0 && !hasWarnedDirectLimit) {
    hasWarnedDirectLimit = true;
    console.warn(
      `[error-reporting] more than ${String(directErrorLimit)} errors without the SDK; the rest are dropped`,
    );
  }
};

/** Give back an admission whose report did not go after all (it did not fit as the page was hidden). */
const releaseDirect = (): void => {
  directReports -= 1;
};

/**
 * The page is hidden (the document turning hidden, and every `pagehide`, kept in the back/forward
 * cache or not, since a hidden page may be frozen or discarded without running again): the errors
 * still waiting, for the SDK's load or for their tags, go now without the SDK, with the tags known
 * now, as far as the keepalive budget allows (`sendSentryEventsOnHide`: newest first, stacks
 * trimmed). Each is admitted ({@link admitDirect}) as it goes, so tab switches during a stalled load
 * never pass {@link directErrorLimit}.
 *
 * Hidden is not gone: what does not fit stays waiting, for the SDK, the next hide or the page being
 * shown again ({@link resumeWaitingErrors}), and while the page stays hidden ({@link isPageHidden})
 * a report that would wait, for the load or for its tags, goes the same way at once
 * ({@link sendNowIfHidden}), a wait the hide released included. Only at exit
 * (`exit`: a `pagehide` the page does not come back from) is the rest counted in one summary event
 * and given up.
 *
 * @param phase - `hidden` while the page may still be shown again; `exit` when it is going for good.
 */
export const sendWaitingErrors = (phase: 'hidden' | 'exit'): void => {
  const isExit = phase === 'exit';
  const forLoad = waitingForLoad.filter((report) => !sentDirectly.has(report));
  const forTags = [...waitingForTags].filter((report) => !sentDirectly.has(report));
  /* What waited for the load is admitted here, newest first as the budget sends, so the errors the
   * limit leaves room for are the ones that can go; what waited for its tags was admitted already. */
  const admitted = new Set(forLoad.toReversed().filter(() => admitDirect()));
  const offered = [...forLoad.filter((report) => admitted.has(report)), ...forTags];
  const done = sendSentryEventsOnHide(
    offered.map((report) => ({ report, error: report.error, tags: describer.now(report.error) })),
    { isExit },
  );
  const gone = new Set([...done].map(({ report }) => report));
  for (const report of isExit ? [...forLoad, ...forTags] : gone) {
    sentDirectly.add(report);
    waitingForTags.delete(report);
  }
  for (const report of admitted) {
    if (!gone.has(report) && !isExit) {
      releaseDirect();
    }
  }
  // Refused at exit is given up; refused while the page may be shown again keeps waiting for the SDK.
  if (isExit) {
    warnDirectDropped(forLoad.length - admitted.size);
  }
  waitingForLoad = isExit ? [] : waitingForLoad.filter((report) => !gone.has(report));
};

/**
 * The one rule wherever a report could start waiting (for the SDK's load, or for its tags): a
 * hidden page ({@link isPageHidden}) may be frozen or discarded and never run again, so nothing
 * waits on it; what waits goes now, as far as the keepalive budget allows ({@link sendWaitingErrors}).
 */
const sendNowIfHidden = (): void => {
  if (isPageHidden()) {
    sendWaitingErrors(hasPageExited() ? 'exit' : 'hidden');
  }
};

/**
 * Reports whose tags settled while the page was hidden and that the hide could not fit: they wait
 * for the page to be shown ({@link resumeWaitingErrors}) or hidden again.
 */
let heldWhileHidden: Report[] = [];

/**
 * Send a report without the SDK once its tags settle, unless the page being hidden sent it first.
 * It is waiting from the call on, so a caller's {@link sendNowIfHidden} right after sends it at once.
 * One rule decides how it goes once its tags are in: on a visible page as an ordinary send; on a
 * hidden page only through the hide's own admission ({@link sendWaitingErrors}), so a wait the hide
 * released never sends past the keepalive budget, and what does not fit keeps waiting, for the next
 * hide or the page being shown again ({@link resumeWaitingErrors}).
 */
const sendDirectlyWhenTagged = async (report: Report): Promise<void> => {
  waitingForTags.add(report);
  const tags = await describer.settled(report.error);
  if (!waitingForTags.has(report)) {
    return;
  }
  if (isPageHidden()) {
    sendNowIfHidden();
    if (waitingForTags.has(report)) {
      heldWhileHidden = [...heldWhileHidden, report];
    }
    return;
  }
  sendDirectly(report, tags);
};

/**
 * The page is shown again: what waited for its tags through the hide and did not fit the keepalive
 * budget goes as it would have on a visible page, each once its tags settle again.
 */
export const resumeWaitingErrors = (): void => {
  if (isPageHidden()) {
    return;
  }
  for (const report of heldWhileHidden.splice(0)) {
    if (waitingForTags.has(report)) {
      // async-iife: bootstrap -- each event goes once its tags settle, as on any visible page.
      void sendDirectlyWhenTagged(report);
    }
  }
};

/** The SDK cannot be used: what waited for it goes without it, each once its tags settle (at once on a hidden page). */
const sendWaitingWithoutSdk = (): void => {
  isSdkUnavailable = true;
  warnDropped();
  // At most `unreportedErrorLimit` waited, within the page's limit for errors without the SDK.
  const waited = waitingForLoad.splice(0);
  const admitted = waited.filter(() => admitDirect());
  warnDirectDropped(waited.length - admitted.length);
  for (const report of admitted) {
    // async-iife: bootstrap -- each event goes once its tags settle; the load's outcome is known now.
    void sendDirectlyWhenTagged(report);
  }
  sendNowIfHidden();
};

/**
 * Start the SDK and hand it what waited. Only the import failing is a load failure (`failure`);
 * the SDK throwing as it starts leaves it unusable, logged once, and is not.
 */
const loadAndStart = async (): Promise<LoadOutcome> => {
  if (isObservabilityHarnessDirect()) {
    sendWaitingWithoutSdk();
    return {};
  }
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
};

/**
 * Report what the early buffer caught before the SDK's handlers were in (`#lib/early-error-buffer`)
 * and remove its listeners. Runs in the same turn the load settles, so no failure reaches both the
 * buffer and the SDK's own handlers.
 */
const reportEarlyErrors = (): void => {
  for (const error of drainEarlyErrors()) {
    // async-iife: bootstrap -- each goes as any reported error does; reporting never rejects.
    void reportUiError(error);
  }
};

/** Start the SDK once per page ({@link loadAndStart}), noting how it ended. */
const start = async (): Promise<LoadOutcome> => {
  started ??= (async (): Promise<LoadOutcome> => {
    const outcome = await loadAndStart();
    loadOutcome = outcome;
    reportEarlyErrors();
    return outcome;
  })();
  return started;
};

/**
 * Start reporting uncaught errors and unhandled rejections. Never rejects. What reached `window`
 * before the SDK's handlers (the early buffer, at most 20) is reported once the load settles, and the
 * buffer's listeners removed. The SDK is loaded once per page: a failed load goes to `onLoadFailure`, once, as its rejection used to reach the global
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
 * Whether a value is this page's own failed load of the SDK, so the stale-build recovery can tell a
 * preload failure Vite reported for the SDK's import from any other, whichever reaches it first:
 * known at once when no load is under way (none started, or its outcome is in), else once the load
 * settles. Vite dispatches the import's own value before rethrowing it into the loader (a test
 * runner may wrap it, so its `cause` counts too).
 *
 * @param value - A value a channel reported.
 * @returns Whether the SDK's load failed with it, now or once the load settles.
 */
export const isSdkLoadFailure = (value: unknown): boolean | Promise<boolean> => {
  const matches = (failure: unknown): boolean =>
    failure !== undefined && (value === failure || (failure instanceof Error && value === failure.cause));
  if (started === undefined) {
    return false;
  }
  if (loadOutcome !== undefined) {
    return matches(loadOutcome.failure);
  }
  const matchesOnceSettled = async (load: Promise<LoadOutcome>): Promise<boolean> => {
    const { failure } = await load;
    return matches(failure);
  };
  return matchesOnceSettled(started);
};

/**
 * Report an error a React or route boundary caught, which never reaches the global handlers, once
 * per page. Captured by the SDK when it is up; kept for it while it loads (at most
 * {@link unreportedErrorLimit}); sent without it once its load failed (at most
 * {@link directErrorLimit} per page), or when the page goes before it loads. On a hidden page it
 * waits for nothing: it goes at once, within the keepalive budget. Nothing is stored on the device.
 * An error is marked reported only once it is captured, kept or sent, so one dropped while the SDK
 * loads can be reported again. Never rejects. What the caller knows of the error (`details`: tags such as
 * `worker`, contexts such as React's component stack, a fingerprint) is recorded on it, so its event carries it on
 * either delivery path; a second report of an error already handed over only adds to them.
 *
 * @param error - The caught value.
 * @param details - Tags, contexts and grouping the caller knows; a primitive cannot carry them.
 */
export const reportUiError = async (error: unknown, details?: ErrorDetails): Promise<void> => {
  if (!ENV.SENTRY_DSN) {
    return;
  }
  if (details !== undefined) {
    recordErrorDetails(error, details);
  }
  if (isWeakKey(error) && reported.has(error)) {
    return;
  }
  const markReported = (): void => {
    if (isWeakKey(error)) {
      reported.add(error);
    }
  };
  if (liveSentry !== undefined) {
    markReported();
    // React reports to the root before componentDidCatch adds the boundary details in the same turn.
    if (!isPageHidden()) {
      await Promise.resolve();
    }
    capture(liveSentry, error);
    return;
  }
  if (isSdkUnavailable) {
    if (!admitDirect()) {
      warnDirectDropped(1);
      return;
    }
    markReported();
    const sent = sendDirectlyWhenTagged({ error });
    sendNowIfHidden();
    await sent;
    return;
  }
  if (waitingForLoad.length >= unreportedErrorLimit) {
    droppedWhileLoading += 1;
    return;
  }
  markReported();
  waitingForLoad = [...waitingForLoad, { error }];
  sendNowIfHidden();
  // Starts this page's only load when nothing has; the error goes with what it does.
  await start();
};
