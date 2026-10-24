// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  loads: 0,
  failNextLoad: false,
  /** Holds the next load until released, as a slow network would. */
  holdNextLoad: undefined as Promise<void> | undefined,
  initSentry: vi.fn(),
  captureUiError: vi.fn(),
}));

const buildId = vi.hoisted(() => 1_792_730_113_029);
vi.mock('#environment.config.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- The environment's own names.
  ENV: { SENTRY_DSN: 'https://public@o0.ingest.sentry.io/42', NODE_ENV: 'test' },
}));
vi.mock('#lib/build-identity.js', () => ({ readBuildId: () => buildId }));
const sentryLibrary = async () => {
  sentry.loads += 1;
  const held = sentry.holdNextLoad;
  sentry.holdNextLoad = undefined;
  await held;
  if (sentry.failNextLoad) {
    sentry.failNextLoad = false;
    // A chunk a deploy stopped serving, or a content blocker: the lazy import of the SDK fails.
    throw new TypeError('Importing a module script failed.');
  }
  return { initSentry: sentry.initSentry, captureUiError: sentry.captureUiError };
};

/** A fresh page: whether reporting has started, and the SDK load, are module-level. */
const load = async () => {
  vi.resetModules();
  vi.doMock('#lib/sentry.lib.js', sentryLibrary);
  return import('#lib/error-reporting.js');
};

type Envelope = {
  readonly url: string;
  readonly init: RequestInit;
  readonly header: Record<string, unknown>;
  readonly event: {
    readonly release?: string;
    readonly environment?: string;
    readonly tags?: Record<string, string>;
    readonly request?: { readonly url?: string };
    readonly exception: { readonly values: ReadonlyArray<{ readonly type: string; readonly value: string }> };
  };
};

/** An envelope's body as sent. */
const bodyOf = (envelope: Envelope): string => (typeof envelope.init.body === 'string' ? envelope.init.body : '');

/** Every envelope posted without the SDK. */
const stubIngest = (respond: () => Promise<Response> = async () => new Response('{}')): Envelope[] => {
  const posted: Envelope[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const [header, , event] = (typeof init.body === 'string' ? init.body : '').split('\n');
    posted.push({
      url,
      init,
      header: JSON.parse(header ?? '{}') as Record<string, unknown>,
      event: JSON.parse(event ?? '{}') as Envelope['event'],
    });
    return respond();
  });
  return posted;
};

const settle = async (): Promise<void> => {
  for (let round = 0; round < 5; round += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Each round lets the previous one's promises settle.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

beforeEach(() => {
  sentry.loads = 0;
  globalThis.history.replaceState(null, '', '/invitations/secret-token?code=123#frag');
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sentry.failNextLoad = false;
  sentry.holdNextLoad = undefined;
});

describe('error reporting', () => {
  it('should load the SDK once per page, and hand a failed load over once', async () => {
    stubIngest();
    const { startErrorReporting, reportUiError, isErrorTrackerListening } = await load();
    const onLoadFailure = vi.fn();
    sentry.failNextLoad = true;

    await expect(startErrorReporting(onLoadFailure)).resolves.toBeUndefined();
    await reportUiError(new Error('caught by a boundary'));
    await startErrorReporting(onLoadFailure);

    expect(sentry.loads).toBe(1);
    expect(isErrorTrackerListening()).toBe(false);
    expect(sentry.captureUiError).not.toHaveBeenCalled();
    expect(onLoadFailure).toHaveBeenCalledOnce();
    const [failure] = onLoadFailure.mock.calls[0] as [unknown];
    // The test runner wraps a failing module factory; the browser's own error is its cause.
    expect(String(failure instanceof Error ? (failure.cause ?? failure) : failure)).toMatch(
      /Importing a module script failed/u,
    );
  });

  it("should send an error reported after a failed load without the SDK, once, as this page's build, scrubbed", async () => {
    const posted = stubIngest();
    const page = await load();
    page.setErrorDescriber({
      now: () => ({}),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- A Sentry tag name.
      settled: async () => ({ stale_build: 'current' }),
    });
    sentry.failNextLoad = true;
    await page.startErrorReporting();
    const error = new Error('caught by a boundary');

    await page.reportUiError(error);
    await page.reportUiError(error);
    page.sendWaitingErrors();
    await settle();

    expect(posted).toHaveLength(1);
    const [envelope] = posted;
    expect(envelope?.url).toBe('https://o0.ingest.sentry.io/api/42/envelope/?sentry_version=7&sentry_key=public');
    expect(envelope?.init).toMatchObject({ method: 'POST', keepalive: true });
    expect(envelope?.header).toMatchObject({ dsn: 'https://public@o0.ingest.sentry.io/42' });
    expect(envelope?.event).toMatchObject({
      release: `tau-ui@${String(buildId)}`,
      environment: 'test',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- A Sentry tag name.
      tags: { stale_build: 'current' },
      exception: { values: [{ type: 'Error', value: 'caught by a boundary' }] },
    });
    // Scrubbed as `beforeSend` scrubs: no query, fragment or invitation token.
    expect(envelope?.event.request?.url).not.toMatch(/secret-token|code=|#frag/u);
  });

  it('should store nothing on the device', async () => {
    stubIngest();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const page = await load();
    sentry.failNextLoad = true;
    await page.startErrorReporting();

    await page.reportUiError(new Error('caught by a boundary'));
    await settle();

    expect(setItem).not.toHaveBeenCalled();
  });

  it('should lose the error, and report nothing more, when the request is blocked too', async () => {
    const posted = stubIngest(async () => {
      throw new TypeError('Failed to fetch');
    });
    const page = await load();
    sentry.failNextLoad = true;
    await page.startErrorReporting();

    await expect(page.reportUiError(new Error('caught by a boundary'))).resolves.toBeUndefined();
    await settle();

    expect(posted).toHaveLength(1);
    expect(sentry.loads).toBe(1);
  });

  it('should send the errors still waiting for the load when the page goes before it settles', async () => {
    const posted = stubIngest();
    // A load that never settles on this page.
    sentry.holdNextLoad = new Promise<void>((resolve) => {
      setTimeout(resolve, 60_000);
    });
    const page = await load();
    void page.startErrorReporting();
    void page.reportUiError(new Error('caught at boot'));

    page.sendWaitingErrors();
    page.sendWaitingErrors();
    await settle();

    expect(posted.map((envelope) => envelope.event.exception.values[0]?.value)).toStrictEqual(['caught at boot']);
  });

  it('should hand the SDK what waited for its load, and capture later errors directly, each once', async () => {
    const posted = stubIngest();
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
    const later = new Error('once the SDK is up');
    await reportUiError(later);
    // A second report of the same value (a remounted error page) is a no-op.
    await reportUiError(later);

    expect(sentry.captureUiError.mock.calls).toStrictEqual([[error], [later]]);
    expect(posted).toHaveLength(0);
  });

  it('should keep at most a bounded number of errors while the SDK loads, and not mark a dropped one reported', async () => {
    const posted = stubIngest();
    let release: () => void = () => undefined;
    sentry.holdNextLoad = new Promise((resolve) => {
      release = resolve;
    });
    sentry.failNextLoad = true;
    const page = await load();
    const started = page.startErrorReporting();
    const kept = Array.from({ length: page.unreportedErrorLimit }, async (_, index) =>
      page.reportUiError(new Error(`error ${String(index)}`)),
    );
    const dropped = new Error('reported while the SDK was loading, beyond the limit');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await page.reportUiError(dropped);
    release();
    await Promise.all([started, ...kept]);
    await settle();
    expect(posted).toHaveLength(page.unreportedErrorLimit);

    // Reported again once the load has settled: it was not marked, so it is sent this time.
    await page.reportUiError(dropped);
    await settle();
    expect(posted).toHaveLength(page.unreportedErrorLimit + 1);
  });

  it('should send every waiting error when the page is hidden, keeping keepalive bodies within the budget and capping each', async () => {
    const posted = stubIngest();
    sentry.holdNextLoad = new Promise<void>((resolve) => {
      setTimeout(resolve, 60_000);
    });
    const page = await load();
    const { keepaliveBudget, directEventTextLimit } = await import('#lib/sentry-event.lib.js');
    void page.startErrorReporting();
    for (let index = 0; index < 20; index += 1) {
      const error = new Error(`${String(index)} ${'x'.repeat(50_000)}`);
      error.stack = 'y'.repeat(50_000);
      void page.reportUiError(error);
    }

    page.sendWaitingErrors();
    await settle();

    expect(posted).toHaveLength(20);
    const keptAlive = posted.filter((envelope) => envelope.init.keepalive === true);
    const keptAliveBytes = keptAlive.reduce((total, envelope) => total + bodyOf(envelope).length, 0);
    expect(keptAlive.length).toBeGreaterThan(0);
    expect(keptAliveBytes).toBeLessThanOrEqual(keepaliveBudget);
    for (const envelope of posted) {
      expect(envelope.event.exception.values[0]?.value.length).toBeLessThanOrEqual(directEventTextLimit.message);
      expect(bodyOf(envelope).length).toBeLessThan(directEventTextLimit.message + directEventTextLimit.stack + 2000);
    }
  });

  it('should handle errors as usual once a hidden page is shown again', async () => {
    const posted = stubIngest();
    let release: () => void = () => undefined;
    sentry.holdNextLoad = new Promise((resolve) => {
      release = resolve;
    });
    const page = await load();
    const started = page.startErrorReporting();
    void page.reportUiError(new Error('before the page was hidden'));

    // Hidden into the back/forward cache, then shown again.
    page.sendWaitingErrors();
    const after = new Error('after the page was shown again');
    const reported = page.reportUiError(after);
    release();
    await Promise.all([started, reported]);

    expect(posted.map((envelope) => envelope.event.exception.values[0]?.value)).toStrictEqual([
      'before the page was hidden',
    ]);
    expect(sentry.captureUiError).toHaveBeenCalledExactlyOnceWith(after);
  });

  it('should send the same thrown string twice when it is reported twice', async () => {
    const posted = stubIngest();
    const page = await load();
    sentry.failNextLoad = true;
    await page.startErrorReporting();

    // Reported twice before either has gone.
    await Promise.all([page.reportUiError('thrown string'), page.reportUiError('thrown string')]);
    await settle();

    expect(posted.map((envelope) => envelope.event.exception.values[0]?.value)).toStrictEqual([
      'thrown string',
      'thrown string',
    ]);
  });

  it('should treat the SDK throwing as it starts as no load failure: logged once, and errors still sent', async () => {
    const posted = stubIngest();
    sentry.initSentry.mockImplementationOnce(() => {
      throw new Error('init threw');
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const page = await load();
    const onLoadFailure = vi.fn();

    await page.startErrorReporting(onLoadFailure);
    await page.reportUiError(new Error('caught by a boundary'));
    await settle();

    expect(onLoadFailure).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledOnce();
    expect(posted.map((envelope) => envelope.event.exception.values[0]?.value)).toStrictEqual(['caught by a boundary']);
  });

  it('should keep capturing the other waiting errors when one capture throws', async () => {
    stubIngest();
    let release: () => void = () => undefined;
    sentry.holdNextLoad = new Promise((resolve) => {
      release = resolve;
    });
    sentry.captureUiError.mockImplementationOnce(() => {
      throw new Error('capture threw');
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const page = await load();
    const onLoadFailure = vi.fn();
    const started = page.startErrorReporting(onLoadFailure);
    const first = new Error('first');
    const second = new Error('second');
    const reports = [page.reportUiError(first), page.reportUiError(second)];

    release();
    await Promise.all([started, ...reports]);

    expect(sentry.captureUiError.mock.calls).toStrictEqual([[first], [second]]);
    expect(onLoadFailure).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledOnce();
  });
});
