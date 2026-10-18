/* eslint-disable @typescript-eslint/naming-convention -- Sentry event and breadcrumb fields are SDK wire names. */
import { describe, expect, it, vi } from 'vitest';
import { NodeClient } from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';
import { reportServerError, scrubSentryEvent } from '#telemetry/sentry.js';

type Transport = ReturnType<NonNullable<ConstructorParameters<typeof NodeClient>[0]['transport']>>;

describe('Sentry privacy defaults', () => {
  it('should keep sensitive collection disabled and scrub the outgoing envelope', async () => {
    const transport = {
      send: vi.fn<Transport['send']>().mockResolvedValue({ statusCode: 200 }),
      flush: vi.fn<Transport['flush']>().mockResolvedValue(true),
    };
    const client = new NodeClient({
      dsn: 'https://public@example.invalid/1',
      integrations: [],
      stackParser: () => [],
      transport: () => transport,
      beforeSend: scrubSentryEvent,
    });
    try {
      const collection = client.getDataCollectionOptions();
      expect(collection.userInfo).toBe(false);
      expect(collection.httpBodies).toEqual([]);
      expect(collection.genAI).toEqual({ inputs: false, outputs: false });
      expect(collection.databaseQueryData).toBe(false);

      client.captureEvent({
        type: undefined,
        message: 'synthetic privacy check',
        request: {
          method: 'POST',
          url: 'https://api.taucad.dev/check?token=private-query',
          headers: { authorization: 'private-header' },
          cookies: { session: 'private-cookie' },
          data: 'private-body',
        },
        user: { email: 'private-user@example.invalid' },
      });
      await client.flush(1000);
      expect(transport.send).toHaveBeenCalledOnce();
      expect(JSON.stringify(transport.send.mock.calls)).toContain('https://api.taucad.dev/check');
      expect(JSON.stringify(transport.send.mock.calls)).not.toMatch(/private-(?:query|header|cookie|body|user)/u);
    } finally {
      await client.close(1000);
    }
  });
});

describe('scrubSentryEvent', () => {
  it('keeps the method and path and drops the query, headers, cookies, body and user', () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        method: 'GET',
        url: 'https://api.taucad.dev/v1/auth/callback/github?code=secret&state=secret',
        query_string: 'code=secret&state=secret',
        headers: { authorization: 'Bearer secret' },
        cookies: { session: 'secret' },
        data: { password: 'secret' },
      },
      user: { email: 'person@example.com' },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request).toStrictEqual({ method: 'GET', url: 'https://api.taucad.dev/v1/auth/callback/github' });
    expect(scrubbed.user).toBeUndefined();
    expect(JSON.stringify(scrubbed)).not.toContain('secret');
  });

  it('leaves an event without a request alone', () => {
    const event: ErrorEvent = { type: undefined, message: 'boom' };

    expect(scrubSentryEvent(event)).toStrictEqual({ type: undefined, message: 'boom' });
  });
});

describe('reportServerError', () => {
  it('is a no-op without SENTRY_DSN', () => {
    expect(() => {
      reportServerError(new Error('boom'), 'req_test');
    }).not.toThrow();
  });
});
