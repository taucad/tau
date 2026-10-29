// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- Sentry envelopes and contexts use wire names. */
import process from 'node:process';
import type * as SentryNode from '@sentry/node';
import type { NodeOptions } from '@sentry/node';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const delivery = vi.hoisted(() => ({ events: [] as unknown[] }));

vi.mock('#environment.config.js', () => ({
  ENV: { SENTRY_DSN: 'https://public@o0.ingest.sentry.io/7', SENTRY_ENVIRONMENT: 'staging', NODE_ENV: 'production' },
}));
vi.mock('#lib/observability-harness-context.js', () => ({ isObservabilityHarnessEnabled: () => true }));
// Only replace delivery: initialization, enrichment, scopes, processors and beforeSend are the real SDK.
vi.mock('@sentry/node', async (importOriginal) => {
  const sentry = await importOriginal<typeof SentryNode>();
  return {
    ...sentry,
    init: (options: NodeOptions) =>
      sentry.init({
        ...options,
        transport: () => ({
          send: async ([, items]) => {
            for (const [header, payload] of items) {
              if (header.type === 'event') {
                delivery.events.push(payload);
              }
            }
            return { statusCode: 200 };
          },
          flush: async () => true,
        }),
      }),
  };
});

beforeEach(() => {
  vi.resetModules();
});

afterEach(async () => {
  const sentry = await import('@sentry/node');
  await sentry.close();
  vi.unstubAllGlobals();
  delivery.events.length = 0;
});

it('should deliver the SSR runtime context after Node enrichment, retaining engine details and request privacy', async () => {
  const pending: Array<Promise<unknown>> = [];
  vi.stubGlobal('Netlify', { context: { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } });
  const { reportSsrError } = await import('#lib/sentry.server.js');

  reportSsrError(new Error('SSR envelope fixture'), {
    request: new Request('https://taucad.dev/__debug/observability?e2e_run=sdk-envelope&secret=private', {
      headers: { Cookie: 'session=private', Authorization: 'Bearer private', 'User-Agent': 'Fixture/1.0' },
    }),
    routeId: 'routes/[__debug].observability/route',
    status: 500,
    channel: 'handle-error',
  });
  expect(pending).toHaveLength(1);
  await Promise.all(pending);

  const { events } = delivery;
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    contexts: {
      runtime: { name: 'ssr' },
      nodeEngine: { name: 'node', version: process.version, type: 'default' },
    },
    tags: { runtime: 'ssr', http_status: '500', e2e_run: 'sdk-envelope' },
    request: {
      url: 'https://taucad.dev/__debug/observability',
      method: 'GET',
      headers: { 'User-Agent': 'Fixture/1.0' },
    },
    exception: { values: [{ value: 'SSR envelope fixture' }] },
  });
  expect(events[0]).not.toHaveProperty('contexts.runtime.version');
  expect(events[0]).not.toHaveProperty('user');
  expect(JSON.stringify(events[0])).not.toMatch(/private|Authorization|Cookie/u);
});

it('should deliver identical failures from independent SSR requests with their own run ids', async () => {
  const pending: Array<Promise<unknown>> = [];
  vi.stubGlobal('Netlify', { context: { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } });
  const { reportSsrError } = await import('#lib/sentry.server.js');
  for (const runId of ['first-request', 'second-request']) {
    const failure = new Error('Identical SSR failure');
    reportSsrError(failure, {
      request: new Request(`https://taucad.dev/__debug/observability?e2e_run=${runId}`),
      routeId: 'routes/[__debug].observability/route',
      status: 500,
      channel: 'handle-error',
    });
  }
  await Promise.all(pending);
  expect(delivery.events).toHaveLength(2);
  expect(delivery.events).toMatchObject([
    { tags: { e2e_run: 'first-request' } },
    { tags: { e2e_run: 'second-request' } },
  ]);
});
