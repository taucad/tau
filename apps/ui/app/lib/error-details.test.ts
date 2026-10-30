// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names are wire names. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import { recordApiRequestId } from '#lib/api-request-id.js';
import { applyErrorDetails, readErrorDetails, recordErrorDetails } from '#lib/error-details.js';
import { beforeSendSentryEvent } from '#lib/sentry.lib.js';
import { sendSentryEventDirectly } from '#lib/sentry-event.lib.js';

vi.mock('#environment.config.js', () => ({
  ENV: { SENTRY_DSN: 'https://public@o0.ingest.sentry.io/42', NODE_ENV: 'test' },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const exceptionEvent = (): ErrorEvent => ({
  type: undefined,
  exception: { values: [{ type: 'Error', value: 'failure' }] },
});

const reactContext = { react: { componentStack: '\n    at Panel' } };

describe('recordErrorDetails', () => {
  it('should merge what several reporters record on one error', () => {
    const error = recordErrorDetails(new Error('failure'), { tags: { worker: 'kernel' }, contexts: reactContext });
    recordErrorDetails(error, { tags: { boundary: 'floating-panel' }, fingerprint: ['group'] });

    expect(readErrorDetails(error)).toEqual({
      tags: { worker: 'kernel', boundary: 'floating-panel' },
      contexts: reactContext,
      fingerprint: ['group'],
    });
  });

  it('should leave a primitive as it was, with no details', () => {
    expect(recordErrorDetails('thrown text', { tags: { worker: 'kernel' } })).toBe('thrown text');
    expect(readErrorDetails('thrown text')).toEqual({ tags: {}, contexts: {} });
  });

  it('should read the api_request_id of an API failure beside the recorded tags', () => {
    const response = new Response('{}', { status: 500, headers: { 'request-id': 'req_1' } });
    const error = recordErrorDetails(recordApiRequestId(new Error('API failure'), response), {
      tags: { code: 'X' },
    });

    expect(readErrorDetails(error).tags).toEqual({ code: 'X', api_request_id: 'req_1' });
  });
});

describe('applyErrorDetails', () => {
  it('should retain reporter context fields beside SDK fields, with SDK values winning conflicts', () => {
    const error = recordErrorDetails(new Error('failure'), {
      contexts: { react: { componentStack: 'Panel', version: 'recorded' } },
    });
    const event = { ...exceptionEvent(), contexts: { react: { version: 'sdk' } } };
    expect(applyErrorDetails(event, error).contexts).toEqual({ react: { componentStack: 'Panel', version: 'sdk' } });
    expect(event.contexts).toEqual({ react: { version: 'sdk' } });
  });

  it('should return the same event when the error carries nothing', () => {
    const event = exceptionEvent();

    expect(applyErrorDetails(event, new Error('other'))).toBe(event);
  });

  it('should keep the event’s own tags, contexts and fingerprint over the recorded ones', () => {
    const error = recordErrorDetails(new Error('failure'), {
      tags: { route: 'recorded', worker: 'kernel' },
      contexts: reactContext,
      fingerprint: ['recorded'],
    });

    const applied = applyErrorDetails({ ...exceptionEvent(), tags: { route: 'event' }, fingerprint: ['event'] }, error);

    expect(applied.tags).toEqual({ route: 'event', worker: 'kernel' });
    expect(applied.contexts).toEqual(reactContext);
    expect(applied.fingerprint).toEqual(['event']);
  });

  it('should let a recorded level and trail correct the capture’s defaults (SB3)', () => {
    const trail = [{ category: 'tau.activity', message: 'render', level: 'info', timestamp: 1_793_324_760 }] as const;
    const error = recordErrorDetails(new Error('tab killed'), { level: 'warning', breadcrumbs: trail });

    const applied = applyErrorDetails(
      { ...exceptionEvent(), level: 'error', breadcrumbs: [{ message: 'this page' }] },
      error,
    );

    expect(applied.level).toBe('warning');
    expect(applied.breadcrumbs).toEqual(trail);
  });
});

describe('details on both delivery paths (SB4, principle 7)', () => {
  const recorded = (): Error =>
    recordErrorDetails(new Error('failure'), {
      tags: { worker: 'agent-host' },
      contexts: reactContext,
      fingerprint: ['worker-failure', 'agent-host'],
    });

  it('should apply them to the SDK event in beforeSend', () => {
    const sent = beforeSendSentryEvent(exceptionEvent(), { originalException: recorded() });

    expect(sent?.tags).toEqual({ worker: 'agent-host' });
    expect(sent?.contexts).toEqual(reactContext);
    expect(sent?.fingerprint).toEqual(['worker-failure', 'agent-host']);
  });

  it('should carry a kill report’s level and replayed trail on the SDK event too (SB3)', () => {
    const error = recordErrorDetails(new Error('tab killed'), {
      level: 'error',
      breadcrumbs: [{ category: 'tau.activity', message: 'open', timestamp: 1_793_324_757 }],
    });

    const sent = beforeSendSentryEvent({ ...exceptionEvent(), level: 'error' }, { originalException: error });

    expect(sent?.level).toBe('error');
    expect(sent?.breadcrumbs).toEqual([{ category: 'tau.activity', message: 'open', timestamp: 1_793_324_757 }]);
  });

  it('should apply them to the event sent without the SDK', async () => {
    const posted: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      posted.push(typeof init.body === 'string' ? init.body : '');
      return new Response('{}');
    });

    await sendSentryEventDirectly(recorded(), {});

    const event = JSON.parse(posted[0]?.split('\n')[2] ?? '{}') as ErrorEvent;
    expect(event.tags).toMatchObject({ worker: 'agent-host', delivery: 'without-sdk' });
    expect(event.contexts).toMatchObject(reactContext);
    expect(event.fingerprint).toEqual(['worker-failure', 'agent-host']);
  });

  it('should send a kill report at its own level without the SDK, not the builder’s error (SB3)', async () => {
    const posted: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      posted.push(typeof init.body === 'string' ? init.body : '');
      return new Response('{}');
    });
    const error = recordErrorDetails(new Error('tab killed'), {
      level: 'warning',
      breadcrumbs: [{ category: 'tau.activity', message: 'render', timestamp: 1_793_324_760 }],
    });

    await sendSentryEventDirectly(error, {});

    const event = JSON.parse(posted[0]?.split('\n')[2] ?? '{}') as ErrorEvent;
    expect(event.level).toBe('warning');
    expect(event.breadcrumbs).toEqual([{ category: 'tau.activity', message: 'render', timestamp: 1_793_324_760 }]);
  });
});
