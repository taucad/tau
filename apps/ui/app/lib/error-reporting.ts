import { ENV } from '#environment.config.js';
import type * as SentryLibrary from '#lib/sentry.lib.js';
import type { QueuedUiError } from '#lib/queued-ui-error.js';
import { readSessionStorage } from '#lib/session-storage.js';
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

/** Errors reported while the SDK is unavailable (loading, or its load failed) kept for the next start, at most. */
export const unreportedErrorLimit = 50;

/** `sessionStorage` key of the errors waiting for the SDK, which outlive the page (a reload, a failed load). */
export const unreportedErrorsKey = 'tau-unreported-errors';

/** Longest stack text a queued error keeps, so the queue stays well inside the storage quota. */
const queuedStackLimit = 8000;

/**
 * The one load of the SDK this page makes. A failed load is not retried on the same page: whether a
 * browser fetches a failed module again differs (the HTML spec cached the failure in the module map
 * until whatwg/html#10327, July 2026, and engines move at their own pace), and the usual cause here,
 * a deploy that stopped serving the SDK's chunk, would fail again anyway. Errors reported after it
 * wait in storage and are delivered by the next page, which loads the current build.
 */
let started:
  | Promise<{
      readonly sentry?: typeof SentryLibrary;
      readonly failure?: unknown;
    }>
  | undefined;
/** The SDK once it has started on this page; captures go straight to it from then on. */
let liveSentry: typeof SentryLibrary | undefined;
/** Whether this page's only load has settled (either way). */
let hasSettled = false;

/** Errors handed to the SDK, or queued for it: a second report of one is a no-op. */
const reported = new WeakSet();
/** This page's queued errors by id, so a flush on the same page captures the original value. */
const originals = new Map<string, unknown>();
/** Ids this page has captured from the queue; each is captured once, whoever flushes it. */
const flushedIds = new Set<string>();
/** The queue where `sessionStorage` is unavailable: it lives as long as the page. */
let memoryQueue: QueuedUiError[] = [];
/** Errors reported beyond the limit while the SDK was unavailable; logged once it starts. */
let droppedWhileUnavailable = 0;
/** Tags a queued error carries, from whoever knows them (the stale-build recovery's `stale_build`). */
let tagQueued: (error: unknown) => Readonly<Record<string, string>> = () => ({});
let sequence = 0;

const isQueuedUiError = (value: unknown): value is QueuedUiError => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Partial<Record<keyof QueuedUiError, unknown>>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.message === 'string' &&
    (entry.stack === undefined || typeof entry.stack === 'string') &&
    typeof entry.time === 'number' &&
    typeof entry.tags === 'object' &&
    entry.tags !== null
  );
};

const readQueue = (): QueuedUiError[] => {
  const storage = readSessionStorage();
  if (storage === undefined) {
    return memoryQueue;
  }
  try {
    const stored: unknown = JSON.parse(storage.getItem(unreportedErrorsKey) ?? '[]');
    return Array.isArray(stored) ? stored.filter((entry) => isQueuedUiError(entry)) : [];
  } catch {
    return memoryQueue;
  }
};

const writeQueue = (queue: QueuedUiError[]): void => {
  memoryQueue = queue;
  const storage = readSessionStorage();
  try {
    if (queue.length === 0) {
      storage?.removeItem(unreportedErrorsKey);
    } else {
      storage?.setItem(unreportedErrorsKey, JSON.stringify(queue));
    }
  } catch {
    // Storage full or blocked: the queue lives in memory for this page only.
  }
};

const serialize = (error: unknown): QueuedUiError => {
  sequence += 1;
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${String(sequence)}`;
  const base = { id, time: Date.now(), tags: tagQueued(error) };
  if (error instanceof Error) {
    return {
      ...base,
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack.slice(0, queuedStackLimit) }),
    };
  }
  return { ...base, name: 'Error', message: String(error) };
};

/**
 * Capture every queued error once (deduplicated by id across pages): the original value when this
 * page queued it, else the stored one, each with the time it was reported and its tags. Entries
 * leave the queue before they are captured, so a second flush (this page, or the next) never repeats one.
 */
const flush = (sentry: typeof SentryLibrary): void => {
  const waiting = readQueue();
  writeQueue([]);
  for (const entry of waiting) {
    if (flushedIds.has(entry.id)) {
      continue;
    }
    flushedIds.add(entry.id);
    const original = originals.get(entry.id);
    originals.delete(entry.id);
    sentry.captureQueuedUiError(entry, original);
  }
  if (droppedWhileUnavailable > 0) {
    console.warn(
      `[error-reporting] ${String(droppedWhileUnavailable)} errors were dropped while the SDK was unavailable`,
    );
    droppedWhileUnavailable = 0;
  }
};

/** Start the SDK once per page and capture the queue (this page's and earlier pages') when it does. */
const start = async (): Promise<{
  readonly sentry?: typeof SentryLibrary;
  readonly failure?: unknown;
}> => {
  started ??= (async () => {
    try {
      const sentry = await loadSentry();
      sentry?.initSentry();
      liveSentry = sentry;
      if (sentry === undefined) {
        // No DSN: nothing will ever deliver the queue.
        writeQueue([]);
        originals.clear();
      } else {
        flush(sentry);
      }
      return { sentry };
    } catch (error) {
      return { failure: error };
    } finally {
      hasSettled = true;
    }
  })();
  return started;
};

/**
 * Start reporting uncaught errors and unhandled rejections, and capture the errors earlier pages
 * queued. Never rejects. The SDK is loaded once per page: a failed load goes to `onLoadFailure`,
 * once, as its rejection used to reach the global handler (the entry hands it to the stale-build
 * recovery, since a deploy may have replaced the SDK's own chunk), and later reports wait for the next page.
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
 * Tag queued errors with what the caller knows of them (the stale-build recovery's `stale_build`),
 * so an error delivered by a later page carries this page's decision.
 *
 * @param tagger - The tags for one reported value.
 */
export const setQueuedErrorTagger = (tagger: (error: unknown) => Readonly<Record<string, string>>): void => {
  tagQueued = tagger;
};

/** Refresh the tags of this page's queued errors, as their decisions settle or before the page goes. */
export const retagQueuedErrors = (): void => {
  if (originals.size === 0) {
    return;
  }
  writeQueue(
    readQueue().map((entry) =>
      originals.has(entry.id) ? { ...entry, tags: tagQueued(originals.get(entry.id)) } : entry,
    ),
  );
};

/**
 * Report an error a React or route boundary caught, which never reaches the global handlers, once.
 * Captured now when the SDK is up; otherwise queued in `sessionStorage` (at most
 * {@link unreportedErrorLimit}) and captured once on the next successful start, on this page or,
 * once its load failed or the page reloaded, the next. An error is marked reported only once it is
 * captured or queued, so one dropped from a full queue can be reported again. Never rejects.
 *
 * @param error - The caught value.
 */
export const reportUiError = async (error: unknown): Promise<void> => {
  if (!ENV.SENTRY_DSN || (isWeakKey(error) && reported.has(error))) {
    return;
  }
  if (liveSentry !== undefined) {
    if (isWeakKey(error)) {
      reported.add(error);
    }
    liveSentry.captureUiError(error);
    return;
  }
  const queue = readQueue();
  if (queue.length < unreportedErrorLimit) {
    const entry = serialize(error);
    originals.set(entry.id, error);
    writeQueue([...queue, entry]);
    if (isWeakKey(error)) {
      reported.add(error);
    }
    // Starts this page's only load when nothing has; captures the queue if it succeeds.
    await start();
    return;
  }
  if (hasSettled) {
    droppedWhileUnavailable += 1;
    return;
  }
  // The queue is full while the load is under way: captured if it succeeds, else dropped.
  const { sentry } = await start();
  if (sentry !== undefined && !(isWeakKey(error) && reported.has(error))) {
    if (isWeakKey(error)) {
      reported.add(error);
    }
    sentry.captureUiError(error);
  } else if (sentry === undefined) {
    droppedWhileUnavailable += 1;
  }
};
