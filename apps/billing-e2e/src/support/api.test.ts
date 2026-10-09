import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiCalls, createApi, failure, harnessOrigin, ok, refusalCode, retryAfterSeconds } from '#support/api.js';
import type { ApiResponse } from '#support/api.js';

const answer = (status: number, body: unknown): ApiResponse => ({
  at: '2026-10-09T00:00:00.000Z',
  method: 'POST',
  path: '/v1/billing/payment-actions/topup',
  status,
  body,
  headers: new Headers(),
});

describe('harnessOrigin', () => {
  it('should refuse tau.new and every subdomain of it, whatever host is admitted', () => {
    for (const url of ['https://tau.new', 'https://api.tau.new/v1', 'https://www.tau.new']) {
      expect(() => harnessOrigin(url, 'tau.new')).toThrow(/production/u);
    }
  });

  it('should admit staging, its subdomains and loopback', () => {
    expect(harnessOrigin('https://taucad.dev/projects')).toBe('https://taucad.dev');
    expect(harnessOrigin('https://api.taucad.dev')).toBe('https://api.taucad.dev');
    expect(harnessOrigin('http://localhost:3000/x')).toBe('http://localhost:3000');
    expect(harnessOrigin('http://127.0.0.1:4000')).toBe('http://127.0.0.1:4000');
  });

  it('should refuse any other host unless it is the one admitted', () => {
    expect(() => harnessOrigin('https://example.com')).toThrow(/TAU_E2E_ALLOW_HOST/u);
    expect(harnessOrigin('https://preview.example.com', 'preview.example.com')).toBe('https://preview.example.com');
  });
});

describe('retryAfterSeconds', () => {
  it('should read x-retry-after before Retry-After', () => {
    expect(retryAfterSeconds(new Headers({ 'x-retry-after': '7', 'retry-after': '3' }))).toBe(7);
    expect(retryAfterSeconds(new Headers({ 'retry-after': '3' }))).toBe(3);
  });

  it('should default to 10 s and clamp to 0..30 s', () => {
    expect(retryAfterSeconds(new Headers())).toBe(10);
    expect(retryAfterSeconds(new Headers({ 'retry-after': 'soon' }))).toBe(10);
    expect(retryAfterSeconds(new Headers({ 'retry-after': '3600' }))).toBe(30);
    expect(retryAfterSeconds(new Headers({ 'retry-after': '-4' }))).toBe(0);
  });
});

describe('createApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
  const respond = (init: { readonly status?: number; readonly body?: string; readonly cookies?: string[] }) =>
    vi.fn<Fetch>(async () => {
      const headers = new Headers({ 'request-id': 'req_1' });
      for (const cookie of init.cookies ?? []) {
        headers.append('set-cookie', cookie);
      }
      return new Response(init.body ?? '{}', { status: init.status ?? 200, headers });
    });

  it('should keep session cookies, send them back and drop an expired one', async () => {
    const fetch = respond({ cookies: ['session_token=abc; Path=/; HttpOnly', 'other=1; Max-Age=60'] });
    vi.stubGlobal('fetch', fetch);
    const api = createApi();
    await api.request('GET', '/v1/auth/get-session');
    expect([...api.jar]).toEqual([
      ['session_token', 'abc'],
      ['other', '1'],
    ]);
    fetch.mockImplementation(async () => {
      const headers = new Headers();
      headers.append('set-cookie', 'other=; Max-Age=0');
      return new Response('null', { status: 200, headers });
    });
    await api.request('GET', '/v1/auth/get-session');
    const [, init] = fetch.mock.calls.at(-1) ?? [];
    expect(new Headers(init?.headers).get('cookie')).toBe('session_token=abc; other=1');
    expect([...api.jar.keys()]).toEqual(['session_token']);
  });

  it('should send the app origin on mutations only, and redact tokens from the recorded path', async () => {
    const fetch = respond({});
    vi.stubGlobal('fetch', fetch);
    const api = createApi();
    await api.request('GET', '/v1/auth/verify-email?token=secret&callbackURL=x');
    await api.request('POST', '/v1/billing/payment-actions/topup', { body: { amountMinor: '500' } });
    const [[, read] = [], [, write] = []] = fetch.mock.calls;
    expect(new Headers(read?.headers).get('origin')).toBeNull();
    expect(new Headers(write?.headers).get('origin')).toBe('https://taucad.dev');
    expect(new Headers(write?.headers).get('content-type')).toBe('application/json');
    expect(apiCalls.slice(-2).map(({ path, requestId }) => [path, requestId])).toEqual([
      ['/v1/auth/verify-email?token=…&callbackURL=x', 'req_1'],
      ['/v1/billing/payment-actions/topup', 'req_1'],
    ]);
  });

  it('should return a 429 as the answer when the row asks not to retry', async () => {
    vi.stubGlobal('fetch', respond({ status: 429, body: 'slow down' }));
    const response = await createApi().request('POST', '/v1/auth/sign-in/email', { retryRateLimit: false });
    expect([response.status, response.body]).toEqual([429, 'slow down']);
  });
});

describe('error envelopes', () => {
  it('should parse a conflict and the pending action it carries', () => {
    const refusal = failure(
      answer(409, { error: 'Conflict', code: 'action_already_pending', statusCode: 409, requestId: 'req_2' }),
    );
    expect(refusal.code).toBe('action_already_pending');
    expect(refusal.action).toBeUndefined();
  });

  it('should read the refusal code of each envelope shape', () => {
    expect(refusalCode(answer(403, { code: 'billing_account_closed', message: 'closed' }))).toBe(
      'billing_account_closed',
    );
    expect(refusalCode(answer(403, { error: 'payment_origin_required', statusCode: 403 }))).toBe(
      'payment_origin_required',
    );
    expect(refusalCode(answer(403, { type: 'error', error: { type: 'BILLING_ACCOUNT_CLOSED', message: 'x' } }))).toBe(
      'BILLING_ACCOUNT_CLOSED',
    );
    expect(refusalCode(answer(500, 'Internal Server Error'))).toBe('none');
  });

  it('should throw on a non-2xx answer with its status and body', () => {
    expect(() => ok(answer(503, { code: 'x' }), z.object({ code: z.string() }))).toThrow(
      /answered 503: \{"code":"x"\}/u,
    );
    expect(ok(answer(200, { code: 'x' }), z.object({ code: z.string() }))).toEqual({ code: 'x' });
  });
});
