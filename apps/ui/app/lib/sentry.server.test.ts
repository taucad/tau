// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names and header names are wire names. */
import { setTimeout as delay } from 'node:timers/promises';
import type { ErrorEvent } from '@sentry/node';
import type { EntryContext } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readBuildId } from '#lib/build-identity.js';
import { sentryRelease } from '#lib/sentry-event.lib.js';

/** The event processor shape the reporter adds to its scope. */
type EventProcessor = (event: ErrorEvent, hint: unknown) => ErrorEvent;

type Captured = { error: unknown; tags: Record<string, string>; event: ErrorEvent; hint: unknown };

const mocks = vi.hoisted(() => {
  const scopeTags: Record<string, string> = {};
  const scopeProcessors: EventProcessor[] = [];
  const environment: Record<string, string | undefined> = {};
  const captured: Captured[] = [];
  return {
    environment,
    harnessEnabled: false,
    scope: { tags: scopeTags, processors: scopeProcessors },
    captured,
    init: vi.fn(),
    flush: vi.fn(async () => true),
  };
});

vi.mock('#environment.config.js', () => ({
  ENV: new Proxy({}, { get: (_target, key: string) => mocks.environment[key] }),
}));
vi.mock('#lib/observability-harness-context.js', () => ({
  isObservabilityHarnessEnabled: () => mocks.harnessEnabled,
}));
vi.mock('@sentry/node', () => {
  const integration = (name: string) => () => ({ name });
  return {
    init: mocks.init,
    flush: mocks.flush,
    eventFiltersIntegration: integration('EventFilters'),
    functionToStringIntegration: integration('FunctionToString'),
    linkedErrorsIntegration: integration('LinkedErrors'),
    dedupeIntegration: integration('Dedupe'),
    nodeContextIntegration: integration('Context'),
    withScope(callback: (scope: unknown) => void) {
      const tags: Record<string, string> = {};
      const processors: EventProcessor[] = [];
      mocks.scope.tags = tags;
      mocks.scope.processors = processors;
      callback({
        setTags: (next: Record<string, string>) => Object.assign(tags, next),
        addEventProcessor: (processor: EventProcessor) => processors.push(processor),
      });
    },
    captureException(error: unknown, hint: unknown) {
      let event: ErrorEvent = { type: undefined };
      for (const processor of mocks.scope.processors) {
        event = processor(event, {});
      }
      mocks.captured.push({ error, tags: { ...mocks.scope.tags }, event, hint });
    },
  };
});

const dsn = 'https://public@o0.ingest.sentry.io/7';
const harnessRoute = 'routes/[__debug].observability/route';

/** Let the reporter's own lazy load and capture run. */
const settle = async (): Promise<void> => {
  await vi.waitFor(() => {
    expect(mocks.flush).toHaveBeenCalled();
  });
};

const loadReporter = async () => import('#lib/sentry.server.js');

beforeEach(() => {
  vi.resetModules();
  mocks.environment = { SENTRY_DSN: dsn, SENTRY_ENVIRONMENT: 'staging', NODE_ENV: 'production' };
  mocks.harnessEnabled = false;
  mocks.captured.length = 0;
  mocks.init.mockClear();
  mocks.flush.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reportSsrError', () => {
  it('should do nothing, not even load the SDK, without SENTRY_DSN', async () => {
    mocks.environment = { NODE_ENV: 'production' };
    const { reportSsrError } = await loadReporter();

    reportSsrError(new Error('loader'), {
      request: new Request('https://taucad.dev/'),
      status: 500,
      channel: 'stream',
    });
    await delay(10);

    expect(mocks.init).not.toHaveBeenCalled();
    expect(mocks.captured).toEqual([]);
  });

  it('should skip a request the client aborted', async () => {
    const { reportSsrError } = await loadReporter();
    const controller = new AbortController();
    controller.abort();

    reportSsrError(new Error('aborted'), {
      request: new Request('https://taucad.dev/', { signal: controller.signal }),
      status: 500,
      channel: 'stream',
    });
    await delay(10);

    expect(mocks.captured).toEqual([]);
  });

  it('should start errors-only, in the browser project environment and release, without default PII', async () => {
    const { reportSsrError, scrubServerSentryEvent } = await loadReporter();

    reportSsrError(new Error('loader'), {
      request: new Request('https://taucad.dev/'),
      status: 500,
      channel: 'stream',
    });
    await settle();

    expect(mocks.init).toHaveBeenCalledOnce();
    const [options] = mocks.init.mock.calls[0] as [Record<string, unknown>];
    expect(options).toMatchObject({
      dsn,
      environment: 'staging',
      release: sentryRelease(readBuildId()),
      sendDefaultPii: false,
      skipOpenTelemetrySetup: true,
      defaultIntegrations: false,
      beforeSend: scrubServerSentryEvent,
    });
    expect(options).not.toHaveProperty('tracesSampleRate');
    expect(options).not.toHaveProperty('tracesSampler');
  });

  it('should tag the runtime, route and status, attaching only the user agent of the request', async () => {
    const { reportSsrError } = await loadReporter();
    const error = new Error('loader');

    reportSsrError(error, {
      request: new Request('https://taucad.dev/w/home/p?token=secret#frag', {
        headers: { 'user-agent': 'Fixture/1.0', cookie: 'session=secret', authorization: 'Bearer secret' },
      }),
      routeId: 'routes/w.$workspace.$project',
      status: 500,
      channel: 'handle-error',
    });
    await settle();

    expect(mocks.captured).toHaveLength(1);
    expect(mocks.captured[0]).toMatchObject({
      error,
      tags: { runtime: 'ssr', route: 'routes/w.$workspace.$project', http_status: '500' },
      hint: { mechanism: { type: 'tau.ssr.handle-error', handled: false } },
      event: { request: { method: 'GET', headers: { 'User-Agent': 'Fixture/1.0' } } },
    });
    expect(Object.keys(mocks.captured[0]?.event.request?.headers ?? {})).toEqual(['User-Agent']);
  });

  it('should tag a staging harness request with its e2e_run, and nothing else from the query', async () => {
    mocks.harnessEnabled = true;
    const { reportSsrError } = await loadReporter();

    reportSsrError(new Error('loader'), {
      request: new Request('https://taucad.dev/__debug/observability?e2e_run=e2e-123&trigger=ssr-loader'),
      routeId: harnessRoute,
      status: 500,
      channel: 'handle-error',
    });
    await settle();

    expect(mocks.captured[0]?.tags).toEqual({
      runtime: 'ssr',
      route: harnessRoute,
      http_status: '500',
      e2e_run: 'e2e-123',
    });
  });

  it('should file a staging harness request under the automated-run environment', async () => {
    mocks.harnessEnabled = true;
    const { reportSsrError } = await loadReporter();

    reportSsrError(new Error('loader'), {
      request: new Request('https://taucad.dev/__debug/observability?e2e_run=e2e-123&trigger=ssr-loader'),
      routeId: harnessRoute,
      status: 500,
      channel: 'handle-error',
    });
    await settle();

    expect(mocks.captured[0]?.event.environment).toBe('staging-e2e');
  });

  it('should not read e2e_run where the harness is disabled', async () => {
    const { reportSsrError } = await loadReporter();

    reportSsrError(new Error('loader'), {
      request: new Request('https://tau.new/__debug/observability?e2e_run=e2e-123'),
      status: 500,
      channel: 'handle-error',
    });
    await settle();

    expect(mocks.captured[0]?.tags).not.toHaveProperty('e2e_run');
  });

  it('should keep the function alive until the event is delivered', async () => {
    const waitUntil = vi.fn();
    vi.stubGlobal('Netlify', { context: { waitUntil } });
    const { reportSsrError } = await loadReporter();

    reportSsrError(new Error('loader'), {
      request: new Request('https://taucad.dev/'),
      status: 500,
      channel: 'stream',
    });

    expect(waitUntil).toHaveBeenCalledOnce();
    await waitUntil.mock.calls[0]?.[0];
    expect(mocks.flush).toHaveBeenCalled();
  });
});

describe('scrubServerSentryEvent', () => {
  it('should keep only the scrubbed URL, method and user agent of the request, and drop the user', async () => {
    const { scrubServerSentryEvent } = await loadReporter();

    const scrubbed = scrubServerSentryEvent({
      type: undefined,
      request: {
        url: 'https://taucad.dev/invitations/inv_abcdefghijklmnopqrstuvwx?code=123#x',
        method: 'GET',
        headers: { 'User-Agent': 'Fixture/1.0', Cookie: 'session=secret', Authorization: 'Bearer secret' },
        cookies: { session: 'secret' },
        query_string: 'code=123',
        data: 'body',
      },
      user: { id: 'u', email: 'person@example.com', ip_address: '1.2.3.4' },
    });

    expect(scrubbed.request).toEqual({
      url: expect.not.stringMatching(/[?#]|secret/u) as unknown,
      method: 'GET',
      headers: { 'User-Agent': 'Fixture/1.0' },
    });
    expect(scrubbed).not.toHaveProperty('user');
    expect(JSON.stringify(scrubbed)).not.toMatch(/secret|code=123|person@example/u);
  });
});

describe('queueSsrError and claimSsrErrors', () => {
  it('should report a document error with the route and status the render names', async () => {
    const { claimSsrErrors, queueSsrError } = await loadReporter();
    const request = new Request('https://taucad.dev/__debug/observability?trigger=ssr-loader');
    const error = new Error('loader');

    queueSsrError(error, request);
    claimSsrErrors(request, harnessRoute, 500);
    await settle();

    expect(mocks.captured).toHaveLength(1);
    expect(mocks.captured[0]?.tags).toMatchObject({ route: harnessRoute, http_status: '500' });
  });

  it('should report an error no document render claims at the next microtask, without a route', async () => {
    const { queueSsrError } = await loadReporter();

    queueSsrError(new Error('data request'), new Request('https://taucad.dev/p.data'));
    await settle();

    expect(mocks.captured).toHaveLength(1);
    expect(mocks.captured[0]?.tags).toEqual({ runtime: 'ssr', http_status: '500' });
  });

  it('should skip a refusal React Router built under 500 and a request the client aborted', async () => {
    const { queueSsrError } = await loadReporter();
    const controller = new AbortController();
    controller.abort();

    queueSsrError(notFound(), new Request('https://taucad.dev/b'));
    queueSsrError(new Error('aborted'), new Request('https://taucad.dev/c', { signal: controller.signal }));
    await delay(10);

    expect(mocks.captured).toEqual([]);
  });
});

/** The error response React Router builds for a path no route matches. */
function notFound(): unknown {
  return { status: 404, statusText: 'Not Found', internal: true, data: 'No route matches', error: new Error('x') };
}

describe('leafRouteId', () => {
  it('should name the deepest matched route', async () => {
    const { leafRouteId } = await loadReporter();
    const context = {
      staticHandlerContext: { matches: [{ route: { id: 'root' } }, { route: { id: harnessRoute } }] },
    } as unknown as EntryContext;

    expect(leafRouteId(context)).toBe(harnessRoute);
  });
});
