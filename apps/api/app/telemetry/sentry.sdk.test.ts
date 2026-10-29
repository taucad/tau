/* eslint-disable @typescript-eslint/naming-convention -- Sentry envelopes and environment keys are wire contracts. */
import type * as SentryNode from '@sentry/node';
import type { NodeOptions } from '@sentry/node';
import { afterEach, expect, it, vi } from 'vitest';

const delivery = vi.hoisted(() => ({ events: [] as unknown[] }));
// Keep the application's actual integrations and scopes; replace only the network transport.
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

afterEach(async () => {
  const sentry = await import('@sentry/node');
  await sentry.close();
  vi.unstubAllEnvs();
  delivery.events.length = 0;
});

it('should deliver identical failures from independent API requests while capturing the same error only once', async () => {
  vi.stubEnv('SENTRY_DSN', 'https://public@sentry.invalid/1');
  const { reportServerError } = await import('#telemetry/sentry.js');
  const sentry = await import('@sentry/node');
  for (const requestId of ['first-request', 'second-request']) {
    const failure = new Error('Identical API failure');
    reportServerError(failure, requestId);
    reportServerError(failure, requestId);
  }
  await sentry.flush(2000);
  expect(delivery.events).toHaveLength(2);
  expect(delivery.events).toEqual([
    expect.objectContaining({ tags: { request_id: 'first-request' } }),
    expect.objectContaining({ tags: { request_id: 'second-request' } }),
  ]);
});
