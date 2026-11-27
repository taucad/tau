// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names are wire names. */
/**
 * A server error in a loader reaches Sentry through the real entry (`handleError` and `handleRequest`) and React
 * Router's own request handler (SB10, blueprint RR2). React Router 8 passes `handleError` the raw request, so a client
 * navigation's error arrives on `/<path>.data?_routes=…`.
 */
import type { ErrorEvent } from '@sentry/node';
import { Outlet } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as entry from '#entry.server.js';
import { createTestRequestHandler, requestData } from '#testing/data-request.js';
import type * as EnvironmentConfig from '#environment.config.js';

type Captured = { readonly error: unknown; readonly tags: Record<string, string>; readonly event: ErrorEvent };

const mocks = vi.hoisted(() => {
  vi.stubEnv('TAU_API_URL', 'https://api.tau.test');
  vi.stubEnv('TAU_WEBSOCKET_URL', 'wss://api.tau.test');
  vi.stubEnv('TAU_FRONTEND_URL', 'https://tau.test');
  return { captured: [] as Captured[], flush: vi.fn(async () => true) };
});

vi.mock('#environment.config.js', async (importOriginal) => {
  const original = await importOriginal<typeof EnvironmentConfig>();
  return {
    ...original,
    ENV: new Proxy(original.ENV, {
      get: (target, key, receiver): unknown =>
        key === 'SENTRY_DSN' ? 'https://public@o0.ingest.sentry.io/7' : Reflect.get(target, key, receiver),
    }),
  };
});
vi.mock('#lib/observability-harness-context.js', () => ({ isObservabilityHarnessEnabled: () => true }));
vi.mock('@sentry/node', () => {
  const integration = (name: string) => () => ({ name });
  type Processor = (event: ErrorEvent) => ErrorEvent;
  let scope: { tags: Record<string, string>; processors: Processor[] } = { tags: {}, processors: [] };
  return {
    init: vi.fn(),
    flush: mocks.flush,
    eventFiltersIntegration: integration('EventFilters'),
    functionToStringIntegration: integration('FunctionToString'),
    linkedErrorsIntegration: integration('LinkedErrors'),
    nodeContextIntegration: integration('Context'),
    withScope(callback: (next: unknown) => void) {
      scope = { tags: {}, processors: [] };
      callback({
        setTags: (tags: Record<string, string>) => Object.assign(scope.tags, tags),
        addEventProcessor: (processor: Processor) => scope.processors.push(processor),
      });
    },
    captureException(error: unknown) {
      let event: ErrorEvent = { type: undefined };
      for (const processor of scope.processors) {
        event = processor(event);
      }
      mocks.captured.push({ error, tags: { ...scope.tags }, event });
    },
  };
});

const harnessRoute = 'routes/[__debug].observability/route';

const handler = createTestRequestHandler({
  routes: [
    { id: 'root', path: '', module: { default: () => <Outlet /> } },
    {
      id: harnessRoute,
      parentId: 'root',
      path: '__debug/observability',
      module: await import('#routes/[__debug].observability/route.js'),
    },
  ],
  entry,
});

const page = 'https://taucad.dev/__debug/observability?trigger=ssr-loader&e2e_run=e2e-123';

beforeEach(() => {
  mocks.captured.length = 0;
  mocks.flush.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('a server error in a loader', () => {
  it('reaches Sentry with its document route and status', async () => {
    const response = await handler(new Request(page));
    await response.text();
    await vi.waitFor(() => {
      expect(mocks.flush).toHaveBeenCalled();
    });

    expect(response.status).toBe(500);
    expect(mocks.captured).toHaveLength(1);
    expect(mocks.captured[0]).toMatchObject({
      error: { message: 'Observability harness SSR loader error' },
      tags: { runtime: 'ssr', route: harnessRoute, http_status: '500', e2e_run: 'e2e-123' },
      event: { request: { url: page, method: 'GET' } },
    });
  });

  it('on a client navigation reaches Sentry under the page URL, not its .data request', async () => {
    const result = await requestData(handler, page, [harnessRoute]);
    await vi.waitFor(() => {
      expect(mocks.flush).toHaveBeenCalled();
    });

    expect(result).toMatchObject({
      kind: 'routes',
      routes: { [harnessRoute]: { error: expect.anything() as unknown } },
    });
    expect(mocks.captured).toHaveLength(1);
    expect(mocks.captured[0]).toMatchObject({
      error: { message: 'Observability harness SSR loader error' },
      tags: { runtime: 'ssr', http_status: '500', e2e_run: 'e2e-123' },
      event: { request: { url: page, method: 'GET' } },
    });
  });
});
