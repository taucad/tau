/* eslint-disable @typescript-eslint/naming-convention -- Sentry event and breadcrumb fields are SDK wire names. */
import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/node';
import { reportServerError, scrubSentryEvent } from '#telemetry/sentry.js';

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
