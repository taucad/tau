/* eslint-disable @typescript-eslint/naming-convention -- Sentry event and breadcrumb fields are SDK wire names. */
import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import { scrubSentryBreadcrumb, scrubSentryEvent } from '#lib/sentry.lib.js';

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
