// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names and the API's header are wire names. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import { recordApiRequestId } from '@taucad/ui-core/lib/api-request-id';
import { beforeSendSentryEvent } from '#lib/sentry.lib.js';
import { sendSentryEventDirectly } from '#lib/sentry-event.lib.js';

vi.mock('#environment.config.js', () => ({
  ENV: { SENTRY_DSN: 'https://public@o0.ingest.sentry.io/42', NODE_ENV: 'test' },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const failedResponse = (requestId?: string): Response =>
  new Response('{}', { status: 500, headers: requestId === undefined ? {} : { 'request-id': requestId } });

const exceptionEvent = (): ErrorEvent => ({
  type: undefined,
  exception: { values: [{ type: 'Error', value: 'API failure' }] },
});

describe('api_request_id on both delivery paths (SB13, principle 7)', () => {
  it('should tag the SDK event of an API failure in beforeSend', () => {
    const error = recordApiRequestId(new Error('API failure'), failedResponse('req_sdk'));

    const sent = beforeSendSentryEvent(exceptionEvent(), { originalException: error });

    expect(sent?.tags).toEqual({ api_request_id: 'req_sdk' });
  });

  it('should leave the SDK event of any other error untagged', () => {
    expect(beforeSendSentryEvent(exceptionEvent(), { originalException: new Error('other') })?.tags).toBeUndefined();
  });

  it('should tag the event sent without the SDK', async () => {
    const posted: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      posted.push(typeof init.body === 'string' ? init.body : '');
      return new Response('{}');
    });
    const error = recordApiRequestId(new Error('API failure'), failedResponse('req_direct'));

    await sendSentryEventDirectly(error, {});

    const event = JSON.parse(posted[0]?.split('\n')[2] ?? '{}') as { tags?: Record<string, string> };
    expect(event.tags).toMatchObject({ api_request_id: 'req_direct', delivery: 'without-sdk' });
  });
});
