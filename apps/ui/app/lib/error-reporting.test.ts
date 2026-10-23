// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueuedUiError } from '#lib/queued-ui-error.js';

const sentry = vi.hoisted(() => ({
  loads: 0,
  failNextLoad: false,
  /** Holds the next load until released, as a slow network would. */
  holdNextLoad: undefined as Promise<void> | undefined,
  initSentry: vi.fn(),
  captureUiError: vi.fn(),
  captureQueuedUiError: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/naming-convention -- The environment's own names.
vi.mock('#environment.config.js', () => ({ ENV: { SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0' } }));
const sentryLibrary = async () => {
  sentry.loads += 1;
  const held = sentry.holdNextLoad;
  sentry.holdNextLoad = undefined;
  await held;
  if (sentry.failNextLoad) {
    sentry.failNextLoad = false;
    // A chunk a deploy stopped serving: the lazy import of the SDK fails.
    throw new TypeError('Importing a module script failed.');
  }
  return {
    initSentry: sentry.initSentry,
    captureUiError: sentry.captureUiError,
    captureQueuedUiError: sentry.captureQueuedUiError,
  };
};

/**
 * A fresh page: whether reporting has started, and the SDK load, are module-level; `sessionStorage`
 * is the tab's and outlives the page, as across a reload.
 */
const load = async () => {
  vi.resetModules();
  vi.doMock('#lib/sentry.lib.js', sentryLibrary);
  return import('#lib/error-reporting.js');
};

const reportedAt = Date.UTC(2026, 9, 23, 12);

/** The entries the SDK was handed from the queue, without their ids. */
const capturedEntries = (): Array<Omit<QueuedUiError, 'id'>> =>
  sentry.captureQueuedUiError.mock.calls.map(([entry]) => {
    const { id: _id, ...rest } = entry as QueuedUiError;
    return rest;
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(reportedAt);
  sentry.loads = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  sentry.failNextLoad = false;
  sentry.holdNextLoad = undefined;
  sessionStorage.clear();
});

describe('error reporting', () => {
  it('should load the SDK once per page: a failed load is not retried, and errors wait for the next page', async () => {
    const { startErrorReporting, reportUiError, isErrorTrackerListening } = await load();
    const onLoadFailure = vi.fn();
    sentry.failNextLoad = true;

    await expect(startErrorReporting(onLoadFailure)).resolves.toBeUndefined();
    await reportUiError(new Error('caught by a boundary'));
    await startErrorReporting(onLoadFailure);

    expect(sentry.loads).toBe(1);
    expect(isErrorTrackerListening()).toBe(false);
    expect(sentry.captureUiError).not.toHaveBeenCalled();
    expect(sentry.captureQueuedUiError).not.toHaveBeenCalled();
    expect(onLoadFailure).toHaveBeenCalledOnce();
    const [failure] = onLoadFailure.mock.calls[0] as [unknown];
    // The test runner wraps a failing module factory; the browser's own error is its cause.
    expect(String(failure instanceof Error ? (failure.cause ?? failure) : failure)).toMatch(
      /Importing a module script failed/u,
    );
  });

  it('should never reject, even when the SDK cannot load', async () => {
    const { reportUiError, startErrorReporting } = await load();
    sentry.failNextLoad = true;
    const started = startErrorReporting();

    await expect(reportUiError(new Error('caught by a boundary'))).resolves.toBeUndefined();
    await expect(started).resolves.toBeUndefined();
  });

  it('should deliver errors queued after a failed load once on the next page, with the time and tags they were reported with', async () => {
    const page = await load();
    page.setQueuedErrorTagger(
      (error): Readonly<Record<string, string>> =>
        // eslint-disable-next-line @typescript-eslint/naming-convention -- A Sentry tag name.
        error instanceof TypeError ? { stale_build: 'superseded' } : {},
    );
    sentry.failNextLoad = true;
    await page.startErrorReporting();
    const first = new TypeError('Importing a module script failed.');
    const second = new Error('caught by a boundary');
    await page.reportUiError(first);
    await page.reportUiError(second);
    await page.reportUiError(first);

    vi.setSystemTime(reportedAt + 60_000);
    const next = await load();
    await next.startErrorReporting();

    expect(capturedEntries()).toStrictEqual([
      {
        name: 'TypeError',
        message: 'Importing a module script failed.',
        stack: first.stack,
        time: reportedAt,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- A Sentry tag name.
        tags: { stale_build: 'superseded' },
      },
      {
        name: 'Error',
        message: 'caught by a boundary',
        stack: second.stack,
        time: reportedAt,
        tags: {},
      },
    ]);
    // Rebuilt from storage: the previous page's values are gone.
    expect(sentry.captureQueuedUiError.mock.calls.map(([, original]) => original as unknown)).toStrictEqual([
      undefined,
      undefined,
    ]);

    const after = await load();
    await after.startErrorReporting();
    expect(sentry.captureQueuedUiError).toHaveBeenCalledTimes(2);
  });

  it('should deliver errors queued while the load is pending once, when the page reloads before it settles', async () => {
    let release: () => void = () => undefined;
    sentry.holdNextLoad = new Promise((resolve) => {
      release = resolve;
    });
    const page = await load();
    const started = page.startErrorReporting();
    const error = new Error('caught by a boundary');
    const reported = page.reportUiError(error);

    // The page reloads (an automatic recovery) while its load is still under way.
    const next = await load();
    await next.startErrorReporting();
    expect(capturedEntries()).toStrictEqual([
      {
        name: 'Error',
        message: 'caught by a boundary',
        stack: error.stack,
        time: reportedAt,
        tags: {},
      },
    ]);

    // Whatever the old page still does, nothing is captured twice.
    release();
    await Promise.all([started, reported]);
    expect(sentry.captureQueuedUiError).toHaveBeenCalledOnce();
  });

  it("should capture this page's queued errors with their original value once the SDK starts", async () => {
    let release: () => void = () => undefined;
    sentry.holdNextLoad = new Promise((resolve) => {
      release = resolve;
    });
    const { reportUiError, startErrorReporting } = await load();
    const started = startErrorReporting();
    const error = new Error('caught at boot');
    const reported = reportUiError(error);

    release();
    await Promise.all([started, reported]);
    await reportUiError(error);

    expect(sentry.captureQueuedUiError).toHaveBeenCalledOnce();
    expect(sentry.captureQueuedUiError.mock.calls[0]?.[1]).toBe(error);
    const later = new Error('once the SDK is up');
    await reportUiError(later);
    // A second report of the same value (a remounted error page) is a no-op.
    await reportUiError(later);
    expect(sentry.captureUiError).toHaveBeenCalledExactlyOnceWith(later);
  });

  it('should keep at most a bounded number of errors while the SDK is unavailable', async () => {
    const page = await load();
    sentry.failNextLoad = true;
    await page.startErrorReporting();
    const errors = Array.from(
      { length: page.unreportedErrorLimit + 5 },
      (_, index) => new Error(`error ${String(index)}`),
    );
    await Promise.all(errors.map(async (error) => page.reportUiError(error)));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const next = await load();
    await next.startErrorReporting();

    expect(sentry.captureQueuedUiError).toHaveBeenCalledTimes(page.unreportedErrorLimit);
    warn.mockRestore();
  });

  it('should not mark an error dropped from a full queue as reported, so it can be reported again', async () => {
    const page = await load();
    let release: () => void = () => undefined;
    sentry.holdNextLoad = new Promise((resolve) => {
      release = resolve;
    });
    sentry.failNextLoad = true;
    const started = page.startErrorReporting();
    const queued = Array.from({ length: page.unreportedErrorLimit }, async (_, index) =>
      page.reportUiError(new Error(`error ${String(index)}`)),
    );
    const dropped = new Error('reported while the queue was full');
    const reported = page.reportUiError(dropped);
    release();
    await Promise.all([started, reported, ...queued]);

    // Room again (the next page delivered the queue): the same error is queued this time.
    sessionStorage.clear();
    await page.reportUiError(dropped);

    const next = await load();
    await next.startErrorReporting();
    expect(capturedEntries().map((entry) => entry.message)).toStrictEqual(['reported while the queue was full']);
  });
});
