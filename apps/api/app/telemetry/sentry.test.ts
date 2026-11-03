/* eslint-disable @typescript-eslint/naming-convention -- Sentry event and breadcrumb fields are SDK wire names. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';
import {
  AutomatedRunFailure,
  getSentryRelease,
  isRetryableGitRefusal,
  reportReadinessFailure,
  reportServerError,
  scrubSentryEvent,
} from '#telemetry/sentry.js';

/** Events a real Sentry client produced, captured in `beforeSend` and never sent. */
const sentEvents: ErrorEvent[] = [];

/**
 * Start a real Sentry client configured as the API configures it (no OpenTelemetry setup, no default
 * integrations), so scope behaviour is the SDK's own and not a mock of `withScope`.
 */
const startSentry = (): void => {
  Sentry.init({
    dsn: 'https://public@sentry.invalid/1',
    skipOpenTelemetrySetup: true,
    defaultIntegrations: false,
    beforeSend: (event) => {
      sentEvents.push(event);
      return null;
    },
  });
};

const stopSentry = async (): Promise<void> => {
  await Sentry.close();
  Sentry.getCurrentScope().setClient(undefined);
};

const captured = async (): Promise<ErrorEvent[]> => {
  await Sentry.flush(2000);
  return sentEvents;
};

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

  it('files a failure a test harness raises on purpose under the automated-run environment', () => {
    const event: ErrorEvent = { type: undefined, environment: 'staging' };

    expect(scrubSentryEvent(event, { originalException: new AutomatedRunFailure('harness') }).environment).toBe(
      'staging-e2e',
    );
    expect(
      scrubSentryEvent({ type: undefined, environment: 'staging' }, { originalException: new Error('real') }),
    ).toStrictEqual({ type: undefined, environment: 'staging' });
  });

  it('leaves an event without a request alone', () => {
    const event: ErrorEvent = { type: undefined, message: 'boom' };

    expect(scrubSentryEvent(event)).toStrictEqual({ type: undefined, message: 'boom' });
  });
});

describe('without SENTRY_DSN', () => {
  it('should report nothing from either reporter', async () => {
    expect(Sentry.isInitialized()).toBe(false);

    reportServerError(new Error('boom'), 'req_test');
    reportReadinessFailure({ indicator: 'database' });

    expect(await captured()).toStrictEqual([]);
  });
});

describe('with a Sentry client', () => {
  beforeAll(startSentry);
  afterAll(stopSentry);
  beforeEach(() => {
    sentEvents.length = 0;
  });

  it('should report a readiness failure as a warning that names the indicator and groups by it', async () => {
    reportReadinessFailure({
      indicator: 'database',
      message: 'Response time exceeds 300ms threshold',
      responseTimeMs: 412,
    });

    const [event] = await captured();
    expect(event).toMatchObject({
      message: 'Readiness check down: database',
      level: 'warning',
      fingerprint: ['health-readiness', 'database'],
      tags: { 'health.indicator': 'database' },
      contexts: {
        readiness: {
          indicator: 'database',
          message: 'Response time exceeds 300ms threshold',
          responseTimeMs: 412,
        },
      },
    });
  });

  it('should not carry a readiness warning into the next unrelated exception (TAU-API-6)', async () => {
    reportReadinessFailure({ indicator: 's3', message: 'Storage readiness timed out after 1500 ms' });
    reportServerError(new Error('GIT_LEASE_OWNER_BUSY'));

    const [warning, exception] = await captured();
    expect(warning?.tags).toStrictEqual({ 'health.indicator': 's3' });
    expect(exception?.exception?.values?.[0]?.value).toBe('GIT_LEASE_OWNER_BUSY');
    expect(exception?.level).toBe('error');
    expect(exception?.fingerprint).toBeUndefined();
    expect(exception?.tags ?? {}).not.toHaveProperty('health.indicator');
    expect(exception?.contexts ?? {}).not.toHaveProperty('readiness');
  });

  it('should tag a server error with its request id and not carry it into the next error', async () => {
    reportServerError(new Error('first'), 'req_first');
    reportServerError(new Error('second'));

    const [first, second] = await captured();
    expect(first?.tags).toStrictEqual({ request_id: 'req_first' });
    expect(second?.tags ?? {}).not.toHaveProperty('request_id');
  });

  it('should not leave readiness fields on the current scope for a later direct capture', async () => {
    reportReadinessFailure({ indicator: 'redis' });
    Sentry.captureMessage('unrelated');

    const [, unrelated] = await captured();
    expect(unrelated?.level).toBe('info');
    expect(unrelated?.tags ?? {}).not.toHaveProperty('health.indicator');
    expect(unrelated?.contexts ?? {}).not.toHaveProperty('readiness');
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

describe('isRetryableGitRefusal', () => {
  it.each(['GIT_LEASE_OWNER_BUSY', 'GIT_LEASE_DISK_FULL', 'GIT_PUSH_RACE_LOST', 'GIT_SERVICE_RESTARTING'])(
    'should classify a 503 %s as a retryable refusal (X3)',
    (code) => {
      expect(isRetryableGitRefusal(503, code)).toBe(true);
    },
  );

  it('should keep reporting an incomplete repository, which retrying cannot clear', () => {
    expect(isRetryableGitRefusal(503, 'GIT_REPOSITORY_INCOMPLETE')).toBe(false);
  });

  it('should keep reporting a 503 whose code it does not know, or that has none', () => {
    expect(isRetryableGitRefusal(503, 'GIT_SOMETHING_NEW')).toBe(false);
    expect(isRetryableGitRefusal(503, 'SERVICE_UNAVAILABLE')).toBe(false);
    expect(isRetryableGitRefusal(503, undefined)).toBe(false);
  });

  it('should keep reporting a retryable code raised with any other status', () => {
    expect(isRetryableGitRefusal(500, 'GIT_LEASE_OWNER_BUSY')).toBe(false);
  });
});
