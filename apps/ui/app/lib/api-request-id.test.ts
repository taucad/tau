// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names and the API's header are wire names. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import { apiRequestIdTags, readApiRequestId, recordApiRequestId } from '#lib/api-request-id.js';
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

describe('readApiRequestId', () => {
  it('should read the id the API names its request by', () => {
    expect(readApiRequestId(failedResponse('req_abc-123'))).toBe('req_abc-123');
  });

  it.each([['req abc'], ['req_abc;x=1'], ['a'.repeat(65)], ['']])('should refuse the malformed id %j', (value) => {
    expect(readApiRequestId(failedResponse(value))).toBeUndefined();
  });

  it('should read nothing from a response without the header (one CORS does not expose)', () => {
    expect(readApiRequestId(failedResponse())).toBeUndefined();
  });
});

describe('apiRequestIdTags', () => {
  it('should tag the error raised from a failed response with its request id', () => {
    const error = recordApiRequestId(new Error('API failure'), failedResponse('req_1'));

    expect(apiRequestIdTags(error)).toEqual({ api_request_id: 'req_1' });
  });

  it('should find the request id of the API failure an error wraps', () => {
    const failure = recordApiRequestId(new Error('API failure'), failedResponse('req_2'));

    expect(apiRequestIdTags(new Error('Saving failed', { cause: failure }))).toEqual({ api_request_id: 'req_2' });
  });

  it('should tag nothing for an unrelated error, a primitive, or a response without an id', () => {
    expect(apiRequestIdTags(new Error('other'))).toEqual({});
    expect(apiRequestIdTags(recordApiRequestId('thrown text', failedResponse('req_3')))).toEqual({});
    expect(apiRequestIdTags(recordApiRequestId(new Error('no id'), failedResponse()))).toEqual({});
  });
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
