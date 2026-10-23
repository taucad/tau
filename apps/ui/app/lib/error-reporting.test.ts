// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  loads: 0,
  failNextLoad: false,
  initSentry: vi.fn(),
  captureUiError: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/naming-convention -- The environment's own names.
vi.mock('#environment.config.js', () => ({ ENV: { SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0' } }));
const sentryLibrary = () => {
  sentry.loads += 1;
  if (sentry.failNextLoad) {
    sentry.failNextLoad = false;
    // A chunk a deploy stopped serving: the lazy import of the SDK fails once.
    throw new TypeError('Importing a module script failed.');
  }
  return { initSentry: sentry.initSentry, captureUiError: sentry.captureUiError };
};

/** Fresh module state per test: whether reporting has started is module-level, and so is the SDK load. */
const load = async () => {
  vi.resetModules();
  vi.doMock('#lib/sentry.lib.js', sentryLibrary);
  return import('#lib/error-reporting.js');
};

afterEach(() => {
  vi.clearAllMocks();
  sentry.failNextLoad = false;
});

describe('error reporting', () => {
  it('should retry starting after a failed load, rather than stay off for the page', async () => {
    const { startErrorReporting, reportUiError, isErrorTrackerListening } = await load();
    sentry.failNextLoad = true;

    await expect(startErrorReporting()).resolves.toBeUndefined();
    expect(isErrorTrackerListening()).toBe(false);

    const error = new Error('caught by a boundary');
    await reportUiError(error);

    expect(sentry.initSentry).toHaveBeenCalledOnce();
    expect(sentry.captureUiError).toHaveBeenCalledExactlyOnceWith(error);
    expect(isErrorTrackerListening()).toBe(true);
  });

  it('should never reject, even when the SDK cannot load', async () => {
    const { reportUiError, startErrorReporting } = await load();
    sentry.failNextLoad = true;
    const started = startErrorReporting();

    await expect(reportUiError(new Error('caught by a boundary'))).resolves.toBeUndefined();
    await expect(started).resolves.toBeUndefined();
  });

  it('should hand a failed SDK load at boot over once, and retry on the next report', async () => {
    const { startErrorReporting, reportUiError } = await load();
    const onLoadFailure = vi.fn();
    sentry.failNextLoad = true;

    await startErrorReporting(onLoadFailure);

    expect(onLoadFailure).toHaveBeenCalledOnce();
    const [failure] = onLoadFailure.mock.calls[0] as [unknown];
    expect(String(failure instanceof Error ? (failure.cause ?? failure) : failure)).toMatch(
      /Importing a module script failed/u,
    );

    const error = new Error('caught by a boundary');
    await reportUiError(error);
    expect(sentry.captureUiError).toHaveBeenCalledExactlyOnceWith(error);
    expect(onLoadFailure).toHaveBeenCalledOnce();
  });
});
