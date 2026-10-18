/* eslint-disable @typescript-eslint/naming-convention -- Sentry event and breadcrumb fields are SDK wire names. */
import { describe, expect, it, vi } from 'vitest';
import { BrowserClient } from '@sentry/react';
import type { ErrorEvent } from '@sentry/react';
import { scrubSentryBreadcrumb, scrubSentryEvent } from '#lib/sentry.lib.js';

type Transport = ReturnType<NonNullable<ConstructorParameters<typeof BrowserClient>[0]['transport']>>;

describe('Sentry privacy defaults', () => {
  it('should keep sensitive collection disabled and scrub the outgoing envelope', async () => {
    const transport = {
      send: vi.fn<Transport['send']>().mockResolvedValue({ statusCode: 200 }),
      flush: vi.fn<Transport['flush']>().mockResolvedValue(true),
    };
    const client = new BrowserClient({
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
          url: 'https://taucad.dev/check?token=private-query',
          headers: { authorization: 'private-header' },
          cookies: { session: 'private-cookie' },
        },
        user: { email: 'private-user@example.invalid' },
      });
      await client.flush(1000);
      expect(transport.send).toHaveBeenCalledOnce();
      expect(JSON.stringify(transport.send.mock.calls)).toContain('https://taucad.dev/check');
      expect(JSON.stringify(transport.send.mock.calls)).not.toMatch(/private-(?:query|header|cookie|user)/u);
    } finally {
      await client.close(1000);
    }
  });
});

describe('scrubSentryEvent', () => {
  it('drops the query string, headers, cookies and user, and redacts invitation tokens', () => {
    const event: ErrorEvent = {
      type: undefined,
      message: 'failed at https://taucad.dev/invitations/abcDEF123',
      request: {
        url: 'https://taucad.dev/invitations/abcDEF123?code=secret',
        headers: { cookie: 'session=secret' },
        cookies: { session: 'secret' },
      },
      user: { email: 'person@example.com' },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request).toStrictEqual({ url: 'https://taucad.dev/invitations/[redacted]' });
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.message).toBe('failed at https://taucad.dev/invitations/[redacted]');
    expect(JSON.stringify(scrubbed)).not.toMatch(/secret|abcDEF123|person@example\.com/u);
  });
});

describe('scrubSentryBreadcrumb', () => {
  it('scrubs navigation and fetch URLs', () => {
    const breadcrumb = scrubSentryBreadcrumb({
      category: 'navigation',
      data: { from: '/invitations/abcDEF123', to: '/auth/verify?token=secret', status_code: 200 },
    });

    expect(breadcrumb.data).toStrictEqual({ from: '/invitations/[redacted]', to: '/auth/verify', status_code: 200 });
  });

  it('leaves a breadcrumb without data alone', () => {
    expect(scrubSentryBreadcrumb({ message: 'click' })).toStrictEqual({ message: 'click' });
  });
});
