/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names and the API's header are wire names. */
import { describe, expect, it } from 'vitest';
import { apiRequestIdTags, readApiRequestId, recordApiRequestId } from '@taucad/ui-core/lib/api-request-id';

const failedResponse = (requestId?: string): Response =>
  new Response('{}', { status: 500, headers: requestId === undefined ? {} : { 'request-id': requestId } });

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
