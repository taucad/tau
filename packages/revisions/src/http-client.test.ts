/**
 * The three rules the Tau git HTTP client exists for (S24, I8, A39).
 *
 * | # | Rule |
 * | --- | --- |
 * | 1 | the Tau credential is an `Authorization` header, never a query string |
 * | 2 | a third-party remote's credential is `x-tau-proxy-authorization`, and the Tau session never reaches the target (W11a §9.3) |
 * | 3 | `keepalive` is refused above the platform's 64 KiB body cap rather than dropped |
 * | 4 | the caller's `signal` and `credentials` reach `fetch` |
 */

import { describe, expect, it, vi } from 'vitest';

import { createRevisionHttpClient, keepaliveLimitBytes } from '#http-client.js';

const encoder = new TextEncoder();

const oneChunk = (bytes: Uint8Array<ArrayBuffer>): AsyncIterableIterator<Uint8Array<ArrayBuffer>> => {
  let sent = false;
  const iterator: AsyncIterableIterator<Uint8Array<ArrayBuffer>> = {
    next: async (): Promise<IteratorResult<Uint8Array<ArrayBuffer>>> => {
      await Promise.resolve();
      if (sent) {
        return { done: true, value: undefined };
      }
      sent = true;
      return { done: false, value: bytes };
    },
    [Symbol.asyncIterator]: (): AsyncIterableIterator<Uint8Array<ArrayBuffer>> => iterator,
  };
  return iterator;
};

const recorder = (): Readonly<{ calls: Array<[string, RequestInit]>; fetch: typeof globalThis.fetch }> => {
  const calls: Array<[string, RequestInit]> = [];
  const stub = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([url, init ?? {}]);
    return new Response('ok', { status: 200, statusText: 'OK' });
  });
  return { calls, fetch: stub as unknown as typeof globalThis.fetch };
};

describe('createRevisionHttpClient', () => {
  it('sends the Tau credential as a header and leaves the URL alone', async () => {
    const { calls, fetch } = recorder();
    const client = createRevisionHttpClient({ authorization: () => 'Bearer tau-session', fetch });

    await client.request({ url: 'https://api.tau.new/v1/git/p1.git/info/refs?service=git-upload-pack' });

    const [url, init] = calls[0]!;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tau-session');
    expect(url).not.toContain('tau-session');
  });

  it('sends a third-party remote’s credential in the proxy header, never as Authorization', async () => {
    const { calls, fetch } = recorder();
    const client = createRevisionHttpClient({
      authorization: () => 'Bearer tau-session',
      proxyAuthorization: () => 'Bearer github-token',
      fetch,
    });

    await client.request({ url: 'https://api.tau.new/v1/git/proxy?url=https%3A%2F%2Fgithub.com%2Fa%2Fb.git' });

    const headers = new Headers(calls[0]![1].headers);
    expect(headers.get('x-tau-proxy-authorization')).toBe('Bearer github-token');
    // The Tau session authenticates the proxy itself and is never forwarded on.
    expect(headers.get('Authorization')).toBe('Bearer tau-session');
    expect(calls[0]![0]).not.toContain('github-token');
  });

  it('refuses a keepalive body over the platform cap instead of letting it vanish', async () => {
    const { fetch } = recorder();
    const client = createRevisionHttpClient({ keepalive: true, fetch });

    await expect(
      client.request({
        url: 'https://api.tau.new/v1/git/p1.git/git-receive-pack',
        method: 'POST',
        body: oneChunk(encoder.encode('x'.repeat(keepaliveLimitBytes + 1))),
      }),
    ).rejects.toThrow(/at most 65536 bytes/u);
  });

  it('refuses oversized declared and streamed Git responses', async () => {
    const declared = createRevisionHttpClient({
      maximumResponseBytes: 2,
      fetch: vi.fn(async () => new Response('long', { headers: { 'content-length': '4' } })),
    });
    await expect(declared.request({ url: 'https://api.tau.new/declared' })).rejects.toThrow(/at most 2 bytes/u);

    const streamed = createRevisionHttpClient({
      maximumResponseBytes: (url) => (url.endsWith('/pack') ? 2 : 8),
      fetch: vi.fn(async () => new Response('long')),
    });
    const response = await streamed.request({ url: 'https://api.tau.new/pack' });
    await expect(async () => {
      for await (const _chunk of response.body) {
        // Consume the body: the streaming bound is enforced during iteration.
      }
    }).rejects.toThrow(/at most 2 bytes/u);
  });

  it('bounds one request on its own signal, and on both when the client has one too (P36)', async () => {
    /* The open pull's 10 s is one operation's bound, not the client's: a
     * client-wide signal would abort every other request the same client is
     * making, so the deadline had no way to reach the socket at all. */
    const { calls, fetch } = recorder();
    const perRequest = new AbortController();
    const client = createRevisionHttpClient({ fetch });

    await client.request({ url: 'https://api.tau.new/v1/git/p1.git/info/refs', signal: perRequest.signal });
    expect(calls[0]![1].signal).toBe(perRequest.signal);

    const clientWide = new AbortController();
    const both = createRevisionHttpClient({ signal: clientWide.signal, fetch });
    await both.request({ url: 'https://api.tau.new/v1/git/p1.git/info/refs', signal: perRequest.signal });
    const merged: AbortSignal | undefined = calls[1]![1].signal ?? undefined;
    expect(merged).not.toBe(clientWide.signal);
    expect(merged).not.toBe(perRequest.signal);
    /* Whichever fires first ends the request. */
    expect(merged?.aborted).toBe(false);
    perRequest.abort();
    expect(merged?.aborted).toBe(true);
  });

  it('passes the open-pull deadline and the browser’s cookies to fetch', async () => {
    const { calls, fetch } = recorder();
    const signal = AbortSignal.timeout(10_000);
    const client = createRevisionHttpClient({ signal, credentials: 'include', fetch });

    await client.request({ url: 'https://api.tau.new/v1/git/p1.git/info/refs' });

    expect(calls[0]![1].signal).toBe(signal);
    expect(calls[0]![1].credentials).toBe('include');
  });
});
