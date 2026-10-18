/* eslint-disable @typescript-eslint/naming-convention -- Sentry event and breadcrumb fields are SDK wire names. */
import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import { consoleBreadcrumbTextLimit, scrubSentryBreadcrumb, scrubSentryEvent } from '#lib/sentry.lib.js';

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

  /* D-UI-31: the SDK keeps the last 100 breadcrumbs, and a console breadcrumb
   * held every logged argument by reference: a logged mesh or file kept alive. */
  it('keeps bounded text, never the logged values, for a console breadcrumb', () => {
    const logged = { mesh: new Float32Array(1024) };
    const breadcrumb = scrubSentryBreadcrumb({
      category: 'console',
      level: 'log',
      message: 'x'.repeat(consoleBreadcrumbTextLimit * 4),
      data: {
        logger: 'console',
        arguments: ['y'.repeat(consoleBreadcrumbTextLimit * 4), logged, new Error('boom'), 42],
      },
    });

    const values = breadcrumb.data?.['arguments'] as unknown[];
    expect(values.every((value) => typeof value === 'string')).toBe(true);
    expect(values).not.toContain(logged);
    expect(values[2]).toBe('Error: boom');
    expect(values[3]).toBe('42');
    expect(values.every((value) => (value as string).length <= consoleBreadcrumbTextLimit + 1)).toBe(true);
    expect(breadcrumb.message?.length).toBeLessThanOrEqual(consoleBreadcrumbTextLimit + 1);
    expect(breadcrumb.data?.['logger']).toBe('console');
  });
});
