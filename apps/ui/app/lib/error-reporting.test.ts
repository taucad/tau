// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  loads: 0,
  failNextLoad: false,
  /** Holds the next load until released, as a slow network would. */
  holdNextLoad: undefined as Promise<void> | undefined,
  initSentry: vi.fn(),
  stopSentry: vi.fn(),
  captureUiError: vi.fn(),
}));

const harness = vi.hoisted(() => ({ direct: false }));
vi.mock('#lib/observability-harness-context.js', () => ({
  isObservabilityHarnessDirect: () => harness.direct,
  observabilityHarnessTags: () => ({}),
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
  return { initSentry: sentry.initSentry, stopSentry: sentry.stopSentry, captureUiError: sentry.captureUiError };
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
  harness.direct = false;
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
  it('should hand a hidden page error to the live SDK immediately', async () => {
    vi.stubGlobal('document', { visibilityState: 'hidden' });
    const reporter = await load();
    await reporter.startErrorReporting();
    const failure = new Error('Hidden live error');
    const reporting = reporter.reportUiError(failure);
    expect(sentry.captureUiError).toHaveBeenCalledExactlyOnceWith(failure);
    await reporting;
  });

  it('should send once through the existing fallback without importing the SDK in direct harness mode', async () => {
    harness.direct = true;
    const posted = stubIngest();
    const reporter = await load();
    const failure = new Error('Observability harness direct-path error');
    await reporter.startErrorReporting();
    await reporter.reportUiError(failure);
    await reporter.reportUiError(failure);
    expect(sentry.loads).toBe(0);
    expect(reporter.isErrorTrackerListening()).toBe(false);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.event.tags).toMatchObject({ delivery: 'without-sdk' });
  });

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
    page.sendWaitingErrors('exit');
    await settle();

    expect(posted).toHaveLength(1);
    const [envelope] = posted;
    // On the web, through the same-origin tunnel (SB5); the envelope still names its DSN for the tunnel to check.
    expect(envelope?.url).toBe('/api/monitoring');
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

    // The refused keepalive request goes once more as an ordinary one (the quota may only have been full), then no more.
    expect(posted.map((envelope) => envelope.init.keepalive)).toStrictEqual([true, false]);
    expect(posted[1]?.header['event_id']).toBe(posted[0]?.header['event_id']);
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

    page.sendWaitingErrors('exit');
    page.sendWaitingErrors('exit');
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

  it('should send errors beyond the keepalive budget as ordinary requests while the page lives', async () => {
    const posted = stubIngest();
    const page = await load();
    const { keepaliveBudget, directEventTextLimit } = await import('#lib/sentry-event.lib.js');
    sentry.failNextLoad = true;
    await page.startErrorReporting();

    for (let index = 0; index < 20; index += 1) {
      const error = new Error(`${String(index)} ${'x'.repeat(50_000)}`);
      error.stack = 'y'.repeat(50_000);
      void page.reportUiError(error);
    }
    await settle();

    expect(posted).toHaveLength(20);
    const keptAlive = posted.filter((envelope) => envelope.init.keepalive === true);
    expect(keptAlive.length).toBeGreaterThan(0);
    expect(keptAlive.length).toBeLessThan(keepaliveBudget.requests);
    expect(keptAlive.reduce((total, envelope) => total + bodyOf(envelope).length, 0)).toBeLessThanOrEqual(
      keepaliveBudget.bytes,
    );
    for (const envelope of posted) {
      expect(envelope.event.exception.values[0]?.value.length).toBeLessThanOrEqual(directEventTextLimit.message);
    }
  });

  it('should send what fits the keepalive budget at page exit, newest first, and count the rest in one summary', async () => {
    const posted = stubIngest();
    const page = await load();
    const { keepaliveBudget, directEventTextLimit, undeliveredAtPageExitMessage } =
      await import('#lib/sentry-event.lib.js');
    // Every error waits for its decision, still under way when the page goes.
    page.setErrorDescriber({
      now: () => ({}),
      settled: async () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({});
          }, 60_000);
        }),
    });
    sentry.failNextLoad = true;
    await page.startErrorReporting();
    const reports = [
      ...Array.from({ length: 20 }, (_, index) => {
        const error = new Error(`large ${String(index)} ${'x'.repeat(50_000)}`);
        error.stack = 'y'.repeat(50_000);
        return error;
      }),
      ...Array.from({ length: 50 }, (_, index) => new Error(`small ${String(index)}`)),
    ];
    for (const error of reports) {
      void page.reportUiError(error);
    }

    page.sendWaitingErrors('exit');
    await settle();

    expect(posted.length).toBeGreaterThan(1);
    expect(posted.length).toBeLessThan(keepaliveBudget.requests);
    expect(posted.every((envelope) => envelope.init.keepalive === true)).toBe(true);
    expect(posted.reduce((total, envelope) => total + bodyOf(envelope).length, 0)).toBeLessThanOrEqual(
      keepaliveBudget.bytes,
    );
    const values = posted.map((envelope) => envelope.event.exception.values[0]?.value ?? '');
    const delivered = values.slice(0, -1);
    // Newest first.
    expect(delivered[0]).toBe('small 49');
    expect(values.at(-1)).toBe(undeliveredAtPageExitMessage(reports.length - delivered.length));
    for (const envelope of posted) {
      expect(bodyOf(envelope).length).toBeLessThan(
        directEventTextLimit.message + directEventTextLimit.stackAtPageExit + 2000,
      );
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
    page.sendWaitingErrors('hidden');
    const after = new Error('after the page was shown again');
    const reported = page.reportUiError(after);
    release();
    await Promise.all([started, reported]);

    expect(posted.map((envelope) => envelope.event.exception.values[0]?.value)).toStrictEqual([
      'before the page was hidden',
    ]);
    expect(sentry.captureUiError).toHaveBeenCalledExactlyOnceWith(after);
  });

  it('should send at most a bounded number of errors without the SDK per page, and say once that it dropped the rest', async () => {
    const posted = stubIngest();
    const page = await load();
    sentry.failNextLoad = true;
    await page.startErrorReporting();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // A boundary that keeps catching a new error (a remount loop), each its own report.
    for (let index = 0; index < page.directErrorLimit + 25; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- One report after another, as a loop would make them.
      await page.reportUiError(new Error(`caught again ${String(index)}`));
    }
    page.sendWaitingErrors('exit');
    await settle();

    expect(posted).toHaveLength(page.directErrorLimit);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('should count errors that waited for the SDK and went as the page was hidden against the limit for errors without it', async () => {
    const posted = stubIngest();
    // A load that stalls for the whole page.
    sentry.holdNextLoad = new Promise<void>((resolve) => {
      setTimeout(resolve, 60_000);
    });
    const page = await load();
    void page.startErrorReporting();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // A remount loop while the user keeps switching tabs: each hide sends what waited.
    for (let round = 0; round < 12; round += 1) {
      for (let index = 0; index < page.unreportedErrorLimit; index += 1) {
        const error = new Error(`round ${String(round)} error ${String(index)}`);
        error.stack = 'short';
        void page.reportUiError(error);
      }
      page.sendWaitingErrors('hidden');
      // oxlint-disable-next-line no-await-in-loop -- The page is shown again before the next switch.
      await settle();
    }

    expect(posted).toHaveLength(page.directErrorLimit);
  });

  it('should say it dropped errors beyond the limit only once one is dropped, not while a hidden page keeps them waiting', async () => {
    const posted = stubIngest();
    let release: () => void = () => undefined;
    sentry.holdNextLoad = new Promise((resolve) => {
      release = resolve;
    });
    const page = await load();
    const started = page.startErrorReporting();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const report = (label: string): void => {
      const error = new Error(label);
      error.stack = 'short';
      void page.reportUiError(error);
    };

    // Tab switches while the load stalls spend the page's limit for errors without the SDK.
    for (let round = 0; posted.length < page.directErrorLimit && round < 50; round += 1) {
      for (let index = 0; index < 10; index += 1) {
        report(`round ${String(round)} error ${String(index)}`);
      }
      page.sendWaitingErrors('hidden');
      // oxlint-disable-next-line no-await-in-loop -- The page is shown again before the next switch.
      await settle();
    }
    // Hidden again with the limit spent: what waits stays waiting, for the SDK.
    report('kept for the SDK');
    page.sendWaitingErrors('hidden');
    await settle();

    expect(posted).toHaveLength(page.directErrorLimit);
    expect(warn).not.toHaveBeenCalled();

    // The load fails: what waited can no longer go, and is dropped now.
    sentry.failNextLoad = true;
    release();
    await started;
    await settle();

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain('the rest are dropped');
  });

  it('should keep what did not fit as the document was hidden for the SDK, which captures it once it loads', async () => {
    const posted = stubIngest();
    let release: () => void = () => undefined;
    sentry.holdNextLoad = new Promise((resolve) => {
      release = resolve;
    });
    const page = await load();
    const started = page.startErrorReporting();
    const errors = Array.from({ length: 30 }, (_, index) => {
      const error = new Error(`caught while the SDK loads ${String(index)}`);
      error.stack = 'y'.repeat(5000);
      return error;
    });
    for (const error of errors) {
      void page.reportUiError(error);
    }

    // A short tab switch: the page lives on, and the SDK arrives right after.
    page.sendWaitingErrors('hidden');
    release();
    await started;
    await settle();

    const sent = posted.map((envelope) => envelope.event.exception.values[0]?.value ?? '');
    const captured = sentry.captureUiError.mock.calls.map(([error]) => (error as Error).message);
    const byText = (left: string, right: string): number => left.localeCompare(right);
    expect(sent.length).toBeGreaterThan(0);
    expect(captured.length).toBeGreaterThan(0);
    // Each error once, by one path or the other, and no summary: nothing was given up.
    expect([...sent, ...captured].toSorted(byText)).toStrictEqual(
      errors.map((error) => error.message).toSorted(byText),
    );
  });

  it('should send an error reported after a failed load while the page is hidden at once, without waiting for its tags', async () => {
    const posted = stubIngest();
    const page = await load();
    page.setErrorDescriber({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- A Sentry tag name.
      now: () => ({ stale_build: 'undecided' }),
      // A decision still under way, as it stays for as long as the page is frozen.
      settled: async () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({});
          }, 60_000);
        }),
    });
    sentry.failNextLoad = true;
    await page.startErrorReporting();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    void page.reportUiError(new Error('caught while hidden'));
    await settle();

    expect(posted.map((envelope) => envelope.event.exception.values[0]?.value)).toStrictEqual(['caught while hidden']);
    expect(posted[0]?.init.keepalive).toBe(true);
    // eslint-disable-next-line @typescript-eslint/naming-convention -- A Sentry tag name.
    expect(posted[0]?.event.tags).toMatchObject({ stale_build: 'undecided' });
  });

  it('should keep waiting, not send as ordinary requests, what the tags released by a hide leave beyond the keepalive budget, and send it once shown', async () => {
    const posted = stubIngest();
    const page = await load();
    const { keepaliveBudget } = await import('#lib/sentry-event.lib.js');
    // Every decision is under way until the page is hidden, which releases each wait at once.
    const waits: Array<() => void> = [];
    page.setErrorDescriber({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- A Sentry tag name.
      now: () => ({ stale_build: 'undecided' }),
      settled: async () =>
        new Promise((resolve) => {
          waits.push(() => {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- A Sentry tag name.
            resolve({ stale_build: 'undecided' });
          });
        }),
    });
    sentry.failNextLoad = true;
    await page.startErrorReporting();
    const errors = Array.from({ length: keepaliveBudget.requests * 2 }, (_, index) => {
      const error = new Error(`waiting for its tags ${String(index)}`);
      error.stack = 'short';
      return error;
    });
    for (const error of errors) {
      void page.reportUiError(error);
    }
    await settle();
    expect(posted).toHaveLength(0);

    // The document turns hidden: the recovery releases every wait, then what waits goes as it may.
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    for (const wake of waits.splice(0)) {
      wake();
    }
    page.sendWaitingErrors('hidden');
    await settle();

    // Only what the keepalive budget took went while hidden; nothing went as an ordinary request.
    expect(posted.length).toBeGreaterThan(0);
    expect(posted.length).toBeLessThan(errors.length);
    expect(posted.every((envelope) => envelope.init.keepalive === true)).toBe(true);

    // Shown again: what still waited goes, each once its tags settle.
    hidden.mockReturnValue('visible');
    page.resumeWaitingErrors();
    for (const wake of waits.splice(0)) {
      wake();
    }
    await settle();

    const byText = (left: string, right: string): number => left.localeCompare(right);
    expect(posted.map((envelope) => envelope.event.exception.values[0]?.value ?? '').toSorted(byText)).toStrictEqual(
      errors.map((error) => error.message).toSorted(byText),
    );
  });

  it('should send an error reported while the SDK loads on a document that boots hidden at once, with no event saying so', async () => {
    const posted = stubIngest();
    sentry.holdNextLoad = new Promise<void>((resolve) => {
      setTimeout(resolve, 60_000);
    });
    // Opened in a background tab: no `visibilitychange` comes until the user looks at it.
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const page = await load();
    void page.startErrorReporting();

    void page.reportUiError(new Error('caught at boot in the background'));
    await settle();

    expect(posted.map((envelope) => envelope.event.exception.values[0]?.value)).toStrictEqual([
      'caught at boot in the background',
    ]);
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

  it('should report what reached window before the SDK started once it starts, then stop listening (SB5)', async () => {
    stubIngest();
    const page = await load();
    const early = new Error('thrown while modules evaluate');
    const rejected = new Error('rejected before the SDK');
    globalThis.dispatchEvent(new ErrorEvent('error', { error: early }));
    const rejection = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(rejection, 'reason', { value: rejected });
    globalThis.dispatchEvent(rejection);

    await page.startErrorReporting();
    await settle();

    expect(sentry.captureUiError.mock.calls).toStrictEqual([[early], [rejected]]);
    // The SDK's own handlers own what comes later: the buffer's listeners are gone.
    globalThis.dispatchEvent(new ErrorEvent('error', { error: new Error('after the SDK started') }));
    await page.startErrorReporting();
    await settle();
    expect(sentry.captureUiError).toHaveBeenCalledTimes(2);
  });

  it('should send what reached window early without the SDK when its load failed', async () => {
    const posted = stubIngest();
    const page = await load();
    globalThis.dispatchEvent(new ErrorEvent('error', { error: new Error('thrown at boot') }));
    sentry.failNextLoad = true;

    await page.startErrorReporting();
    await settle();

    expect(posted.map((envelope) => envelope.event.exception.values[0]?.value)).toStrictEqual(['thrown at boot']);
  });

  it('should post to the DSN directly, not the tunnel, on desktop', async () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    try {
      const posted = stubIngest();
      const page = await load();
      sentry.failNextLoad = true;
      await page.startErrorReporting();

      await page.reportUiError(new Error('caught by a boundary'));
      page.sendWaitingErrors('exit');
      await settle();

      expect(posted[0]?.url).toBe('https://o0.ingest.sentry.io/api/42/envelope/?sentry_version=7&sentry_key=public');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
