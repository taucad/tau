/* eslint-disable @typescript-eslint/naming-convention -- Sentry event and breadcrumb fields are SDK wire names. */
import { describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/node';
import type { ErrorEvent, Scope } from '@sentry/node';
import { getSentryRelease, reportReadinessFailure, reportServerError, scrubSentryEvent } from '#telemetry/sentry.js';

vi.mock('@sentry/node', async (importOriginal) => ({
  ...(await importOriginal<typeof Sentry>()),
  isInitialized: vi.fn(() => false),
  withScope: vi.fn(),
  captureMessage: vi.fn(),
}));

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

describe('reportReadinessFailure', () => {
  it('is a no-op without SENTRY_DSN', () => {
    reportReadinessFailure({ indicator: 'database' });

    expect(Sentry.withScope).not.toHaveBeenCalled();
  });

  it('reports a warning that names the indicator and groups by it', () => {
    const scope = { setLevel: vi.fn(), setFingerprint: vi.fn(), setTag: vi.fn(), setContext: vi.fn() };
    vi.mocked(Sentry.isInitialized).mockReturnValueOnce(true);
    vi.mocked(Sentry.withScope).mockImplementationOnce(((callback: (scope: Scope) => unknown) =>
      callback(scope as unknown as Scope)) as typeof Sentry.withScope);

    reportReadinessFailure({
      indicator: 'database',
      message: 'Response time exceeds 300ms threshold',
      responseTimeMs: 412,
    });

    expect(scope.setLevel).toHaveBeenCalledWith('warning');
    expect(scope.setFingerprint).toHaveBeenCalledWith(['health-readiness', 'database']);
    expect(scope.setTag).toHaveBeenCalledWith('health.indicator', 'database');
    expect(scope.setContext).toHaveBeenCalledWith('readiness', {
      indicator: 'database',
      message: 'Response time exceeds 300ms threshold',
      responseTimeMs: 412,
    });
    expect(Sentry.captureMessage).toHaveBeenCalledWith('Readiness check down: database');
  });
});

describe('getSentryRelease', () => {
  it('should retain the deployed image identity without forbidden registry separators', () => {
    expect(getSentryRelease('registry.fly.io/tau-api-staging:84b54db3f93976ba720d2e2cd0fead79c657bb1a')).toBe(
      'tau-api-staging:84b54db3f93976ba720d2e2cd0fead79c657bb1a',
    );
    expect(getSentryRelease('registry.fly.io/tau-api@sha256:abcdef')).toBe('tau-api@sha256:abcdef');
  });

  it('should leave the release unset when no image reference exists', () => {
    expect(getSentryRelease(undefined)).toBeUndefined();
  });
});
