/* eslint-disable @typescript-eslint/naming-convention -- Sentry event and breadcrumb fields are SDK wire names. */
import { describe, expect, it, vi } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import type { StaleBuildOutcome } from '#lib/stale-build-recovery.js';
import {
  beforeSendSentryEvent,
  consoleBreadcrumbTextLimit,
  createBeforeSend,
  sentryRelease,
  isUnhandledAbortRejection,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
} from '#lib/sentry.lib.js';

const rejectionMechanism = 'auto.browser.global_handlers.onunhandledrejection';

/** The event the browser SDK builds for an unhandled rejection whose reason has no stack, as in TAU-UI-4. */
const rejectionEvent = (mechanism = rejectionMechanism): ErrorEvent => ({
  type: undefined,
  exception: {
    values: [
      {
        type: 'Error',
        value: 'AbortError: The operation was aborted.',
        mechanism: { type: mechanism, handled: false },
      },
    ],
  },
  tags: { 'DOMException.code': '20' },
});

const abort = new DOMException('The operation was aborted.', 'AbortError');

describe('isUnhandledAbortRejection', () => {
  it('matches an unhandled rejection whose reason is an AbortError DOMException', () => {
    expect(isUnhandledAbortRejection(rejectionEvent(), { originalException: abort })).toBe(true);
  });

  it('matches an unhandled rejection whose reason is an Error named AbortError', () => {
    const error = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    expect(isUnhandledAbortRejection(rejectionEvent(), { originalException: error })).toBe(true);
  });

  it.each([
    ['an Error that mentions an abort', new Error('The operation was aborted.')],
    ['the string AbortError', 'AbortError'],
    ['a TimeoutError', new DOMException('Timed out', 'TimeoutError')],
  ])('keeps an unhandled rejection whose reason is %s', (_label, reason) => {
    expect(isUnhandledAbortRejection(rejectionEvent(), { originalException: reason })).toBe(false);
  });

  it.each(['generic', 'auto.browser.global_handlers.onerror'])(
    'keeps an AbortError reported through the %s mechanism',
    (mechanism) => {
      expect(isUnhandledAbortRejection(rejectionEvent(mechanism), { originalException: abort })).toBe(false);
    },
  );

  it('keeps an event without a hint', () => {
    expect(isUnhandledAbortRejection(rejectionEvent(), undefined)).toBe(false);
  });
});

describe('beforeSendSentryEvent', () => {
  it('drops an unhandled abort rejection', () => {
    expect(beforeSendSentryEvent(rejectionEvent(), { originalException: abort })).toBeNull();
  });

  it('scrubs and keeps any other event', () => {
    const event: ErrorEvent = { ...rejectionEvent(), user: { email: 'person@example.com' } };
    const sent = beforeSendSentryEvent(event, { originalException: new Error('boom') });
    expect(sent?.exception).toStrictEqual(rejectionEvent().exception);
    expect(sent?.user).toBeUndefined();
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

/** The event the browser SDK builds for TAU-UI-6: a route boundary's capture of a stackless WebKit import failure. */
const moduleImportEvent = (): ErrorEvent => ({
  type: undefined,
  exception: {
    values: [
      { type: 'TypeError', value: 'Importing a module script failed.', mechanism: { type: 'generic', handled: true } },
    ],
  },
  request: { url: 'https://taucad.dev/w/home/ak47-receiver-curves?tab=chat' },
});

const moduleImportFailure = new TypeError('Importing a module script failed.');

describe('createBeforeSend', () => {
  it.each<StaleBuildOutcome>(['reloading', 'superseded'])(
    'should drop a module import failure a deploy explains (%s)',
    async (outcome) => {
      const decide = vi.fn(async (_failure: unknown) => outcome);
      const beforeSend = createBeforeSend(decide);

      await expect(beforeSend(moduleImportEvent(), { originalException: moduleImportFailure })).resolves.toBeNull();
      expect(decide).toHaveBeenCalledExactlyOnceWith(moduleImportFailure);
    },
  );

  it('should report a module import failure the live build still has, scrubbed', async () => {
    const beforeSend = createBeforeSend(async () => 'current');

    const sent = await beforeSend(moduleImportEvent(), { originalException: moduleImportFailure });

    expect(sent?.exception).toStrictEqual(moduleImportEvent().exception);
    expect(sent?.request).toStrictEqual({ url: 'https://taucad.dev/w/home/ak47-receiver-curves' });
  });

  it('should not probe the server for any other error', () => {
    const decide = vi.fn(async (_failure: unknown): Promise<StaleBuildOutcome> => 'reloading');
    const beforeSend = createBeforeSend(decide);

    const sent = beforeSend(rejectionEvent('generic'), { originalException: new Error('boom') });

    expect(sent).not.toBeInstanceOf(Promise);
    expect(decide).not.toHaveBeenCalled();
  });
});

describe('sentryRelease', () => {
  it('should name the deploy an event came from by its build id', () => {
    expect(sentryRelease(1_792_730_113_029)).toBe('tau-ui@1792730113029');
  });

  it('should leave the release unset for a bundle without a build id', () => {
    expect(sentryRelease(0)).toBeUndefined();
  });
});
