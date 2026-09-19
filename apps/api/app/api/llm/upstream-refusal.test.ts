import { describe, expect, it } from 'vitest';
import {
  classifyUpstreamRefusal,
  cloudUpstreamRefusalMessage,
  readUpstreamRefusal,
  redactCredentials,
  upstreamRetryAfterSeconds,
} from '#api/llm/upstream-refusal.js';

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('redactCredentials', () => {
  it.each([
    ['an authorization header value', 'authorization: Bearer ya29.a0AfH6SMBx-secret', 'ya29.a0AfH6SMBx-secret'],
    ['an OpenAI-style key', 'key sk-proj-AbCdEf0123456789 rejected', 'sk-proj-AbCdEf0123456789'],
    ['an xAI-style key', 'key xai-AbCdEf0123456789 rejected', 'xai-AbCdEf0123456789'],
    ['a Google API key', 'key=AIzaSyA0123456789abcdefg', 'AIzaSyA0123456789abcdefg'],
    ['a JWT', 'assertion eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ0YXUifQ.c2lnbmF0dXJl', 'eyJhbGciOiJSUzI1NiJ9'],
    [
      'a JSON private key',
      String.raw`{"private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADAN\n-----END PRIVATE KEY-----\n"}`,
      'MIIEvQIBADAN',
    ],
  ])('should remove %s', (_name, text, secret) => {
    const redacted = redactCredentials(text);

    expect(redacted).not.toContain(secret);
    expect(redacted).toContain('[redacted]');
  });

  it('should leave a diagnostic body untouched', () => {
    const body = '{"error":{"code":400,"status":"INVALID_ARGUMENT","message":"ref loops are only supported"}}';

    expect(redactCredentials(body)).toBe(body);
  });
});

describe('readUpstreamRefusal', () => {
  it('should parse the body for recognition and keep a redacted copy for the log', async () => {
    const body = { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Bearer ya29.secret-token' } };

    const refusal = await readUpstreamRefusal(jsonResponse(body, 400));

    expect(refusal.body).toEqual(body);
    expect(refusal.loggedBody).toContain('INVALID_ARGUMENT');
    expect(refusal.loggedBody).not.toContain('ya29.secret-token');
  });

  it('should bound the logged copy at 2 KiB', async () => {
    const refusal = await readUpstreamRefusal(jsonResponse({ error: { message: 'x'.repeat(8 * 1024) } }, 400));

    expect(refusal.loggedBody).toHaveLength(2 * 1024);
  });

  it('should log nothing for a body that is not JSON', async () => {
    const refusal = await readUpstreamRefusal(new Response('<html>502 Bad Gateway</html>', { status: 502 }));

    expect(refusal).toEqual({ body: undefined });
  });

  it('should tolerate an absent body', async () => {
    expect(await readUpstreamRefusal(new Response(undefined, { status: 503 }))).toEqual({ body: undefined });
  });

  it('should tolerate an already-consumed body', async () => {
    const response = jsonResponse({ error: { message: 'gone' } }, 400);
    await response.text();

    expect(await readUpstreamRefusal(response)).toEqual({ body: undefined });
  });
});

describe('upstreamRetryAfterSeconds', () => {
  it.each([
    ['7', 7],
    ['0', 0],
    // An HTTP-date Retry-After carries no delta-seconds estimate.
    ['Wed, 21 Oct 2026 07:28:00 GMT', undefined],
    ['-1', undefined],
    ['', undefined],
  ])('should read %s as %s', (header, seconds) => {
    expect(upstreamRetryAfterSeconds(new Headers({ 'retry-after': header }))).toBe(seconds);
  });

  it('should report no estimate when the header is absent', () => {
    expect(upstreamRetryAfterSeconds(new Headers())).toBeUndefined();
  });
});

describe('classifyUpstreamRefusal', () => {
  it('should map an upstream 429 to RATE_LIMITED carrying its retry estimate', () => {
    expect(classifyUpstreamRefusal({ status: 429, retryAfterSeconds: 7, accountOwner: 'operator' })).toEqual({
      status: 429,
      type: 'RATE_LIMITED',
      details: { retryAfterSeconds: 7 },
    });
  });

  it('should map an upstream 429 without a retry estimate to RATE_LIMITED alone', () => {
    expect(classifyUpstreamRefusal({ status: 429, accountOwner: 'tau' })).toEqual({
      status: 429,
      type: 'RATE_LIMITED',
    });
  });

  it.each([
    // Google answers 499 CANCELLED on the Vertex wire; it is an outage, not a rejected request.
    [499],
    [500],
    [503],
  ])('should map upstream %i to PROVIDER_UNAVAILABLE', (status) => {
    expect(classifyUpstreamRefusal({ status, accountOwner: 'operator' })).toEqual({
      status: 503,
      type: 'PROVIDER_UNAVAILABLE',
    });
  });

  it.each([[400], [404], [422]])('should map upstream %i to UPSTREAM_REJECTED', (status) => {
    expect(classifyUpstreamRefusal({ status, accountOwner: 'operator' })).toEqual({
      status: 502,
      type: 'UPSTREAM_REJECTED',
    });
  });

  it.each([[401], [403]])('should keep upstream %i as each account owner already answered it', (status) => {
    expect(classifyUpstreamRefusal({ status, accountOwner: 'operator' }).type).toBe('UPSTREAM_REJECTED');
    expect(classifyUpstreamRefusal({ status, accountOwner: 'tau' }).type).toBe('PROVIDER_UNAVAILABLE');
  });

  it('should treat a 2xx that carried no stream as an outage', () => {
    expect(classifyUpstreamRefusal({ status: 200, accountOwner: 'tau' })).toEqual({
      status: 503,
      type: 'PROVIDER_UNAVAILABLE',
    });
  });
});

describe('cloudUpstreamRefusalMessage', () => {
  it.each([
    ['UPSTREAM_REJECTED', 400, 'The model provider rejected the request (HTTP 400).'],
    ['RATE_LIMITED', 429, 'The model provider is rate limiting this request.'],
    ['PROVIDER_UNAVAILABLE', 503, 'The model provider is unavailable.'],
  ] as const)('should answer a %s with the sentence a Cloud customer reads', (type, status, expected) => {
    expect(cloudUpstreamRefusalMessage({ type, status })).toBe(expected);
  });

  it('should never quote the supplier, whatever it said', () => {
    // The pre-stream leg and the mid-stream frame filter share these sentences so
    // a refusal cannot name Tau's supplier account on one path and not the other.
    expect(cloudUpstreamRefusalMessage({ type: 'RATE_LIMITED', status: 429 })).not.toContain('Resource exhausted');
  });
});
