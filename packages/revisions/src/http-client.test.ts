/**
 * The three rules the Tau git HTTP client exists for (S24, I8, A39).
 *
 * | # | Rule |
 * | --- | --- |
 * | 1 | the Tau credential is an `Authorization` header, never a query string |
 * | 2 | a third-party remote's credential is `x-tau-proxy-authorization`, and the Tau session never reaches the target (W11a §9.3) |
 * | 3 | `keepalive` is refused above the platform's 64 KiB body cap rather than dropped |
 * | 4 | the caller's `signal` and `credentials` reach `fetch` |
 * | 5 | a `429`, or a `503` that names a `Retry-After`, is retried after that wait plus jitter, a bounded number of times, replaying the buffered body (Hosted Remote Storage DA6, charter D8) |
 */

import { describe, expect, it, vi } from 'vitest';

import { createRevisionHttpClient, keepaliveLimitBytes, revisionHttpRetryPolicy } from '#http-client.js';

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

/**
 * DA6 (charter D8): the API answers an owner over its in-flight cap with `429`
 * and a jittered `Retry-After`, and a lost manifest race or a full worker with
 * a `503` that names one. The client waits what the server named, plus its own
 * jitter, and sends the same request again, a bounded number of times, so a
 * device that briefly exceeds the cap never surfaces an error to its user.
 */
describe('createRevisionHttpClient retries', () => {
  const url = 'https://api.tau.new/v1/git/p1.git/git-receive-pack';

  /** A fetch that answers from a script, recording each call's body bytes. */
  const scripted = (
    answers: ReadonlyArray<() => Response>,
  ): Readonly<{
    fetch: typeof globalThis.fetch;
    bodies: string[];
    calls: () => number;
  }> => {
    const bodies: string[] = [];
    let index = 0;
    const stub = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(init?.body === undefined ? '' : new TextDecoder().decode(init.body as Uint8Array<ArrayBuffer>));
      const answer = answers[Math.min(index, answers.length - 1)]!;
      index += 1;
      return answer();
    });
    return {
      fetch: stub as unknown as typeof globalThis.fetch,
      bodies,
      calls: () => index,
    };
  };
  const answer =
    (status: number, headers: Record<string, string> = {}): (() => Response) =>
    () =>
      new Response(status === 200 ? 'ok' : 'refused', { status, headers });
  const waits = (): Readonly<{
    sleep: (milliseconds: number) => Promise<void>;
    slept: number[];
  }> => {
    const slept: number[] = [];
    return {
      slept,
      sleep: async (milliseconds: number) => {
        slept.push(milliseconds);
      },
    };
  };

  it('documents its policy: four attempts, Retry-After plus up to a second of jitter, waits over ten seconds left to the caller', () => {
    expect(revisionHttpRetryPolicy).toEqual({
      maxAttempts: 4,
      jitterMilliseconds: 1000,
      maximumWaitMilliseconds: 10_000,
      backoffBaseMilliseconds: 1000,
    });
  });

  it('waits a 429’s Retry-After plus jitter, then replays the same push body and returns the success', async () => {
    const { fetch, bodies } = scripted([answer(429, { 'retry-after': '2' }), answer(200)]);
    const { sleep, slept } = waits();
    const client = createRevisionHttpClient({
      fetch,
      retry: { sleep, random: () => 0.25 },
    });

    const response = await client.request({
      url,
      method: 'POST',
      body: oneChunk(encoder.encode('PACK-bytes')),
    });

    expect(response.statusCode).toBe(200);
    expect(slept).toEqual([2250]);
    expect(bodies).toEqual(['PACK-bytes', 'PACK-bytes']);
  });

  it('keeps every wait between Retry-After and Retry-After plus one second', async () => {
    for (const random of [0, 0.5, 0.9999]) {
      const { fetch } = scripted([answer(429, { 'retry-after': '3' }), answer(200)]);
      const { sleep, slept } = waits();
      // oxlint-disable-next-line no-await-in-loop -- one draw per bound
      await createRevisionHttpClient({
        fetch,
        retry: { sleep, random: () => random },
      }).request({ url });
      expect(slept[0]).toBeGreaterThanOrEqual(3000);
      expect(slept[0]).toBeLessThan(4000);
    }
  });

  it('retries a 503 that names a Retry-After, and returns one that does not as it came', async () => {
    const retryable = scripted([answer(503, { 'retry-after': '5' }), answer(200)]);
    const { sleep, slept } = waits();
    const response = await createRevisionHttpClient({
      fetch: retryable.fetch,
      retry: { sleep, random: () => 0 },
    }).request({ url });
    expect(response.statusCode).toBe(200);
    expect(slept).toEqual([5000]);

    const bare = scripted([answer(503), answer(200)]);
    const unmarked = await createRevisionHttpClient({
      fetch: bare.fetch,
      retry: { sleep },
    }).request({ url });
    expect(unmarked.statusCode).toBe(503);
    expect(bare.calls()).toBe(1);
  });

  it('stops after four attempts and returns the last refusal with its Retry-After', async () => {
    const { fetch, calls } = scripted([answer(429, { 'retry-after': '1' })]);
    const { sleep, slept } = waits();
    const response = await createRevisionHttpClient({
      fetch,
      retry: { sleep, random: () => 0 },
    }).request({ url });

    expect(calls()).toBe(4);
    expect(slept).toEqual([1000, 1000, 1000]);
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('1');
  });

  it('honours a different attempt bound when the caller sets one', async () => {
    const { fetch, calls } = scripted([answer(429, { 'retry-after': '1' })]);
    const { sleep } = waits();
    await createRevisionHttpClient({
      fetch,
      retry: { sleep, maxAttempts: 2 },
    }).request({ url });
    expect(calls()).toBe(2);
  });

  it('never retries a status that is not a wait', async () => {
    for (const status of [400, 401, 403, 404, 409, 413, 422, 500, 502, 504]) {
      const { fetch, calls } = scripted([answer(status, { 'retry-after': '1' }), answer(200)]);
      const { sleep, slept } = waits();
      // oxlint-disable-next-line no-await-in-loop -- one status at a time
      const response = await createRevisionHttpClient({
        fetch,
        retry: { sleep },
      }).request({ url });
      expect(response.statusCode).toBe(status);
      expect(calls()).toBe(1);
      expect(slept).toEqual([]);
    }
  });

  it('backs a 429 with no Retry-After off exponentially with jitter, within the wait ceiling', async () => {
    const { fetch } = scripted([answer(429)]);
    const { sleep, slept } = waits();
    await createRevisionHttpClient({
      fetch,
      retry: { sleep, random: () => 0 },
    }).request({ url });
    const high = waits();
    await createRevisionHttpClient({
      fetch,
      retry: { sleep: high.sleep, random: () => 0.9999 },
    }).request({ url });

    /* Equal jitter: attempt n waits between half and all of 1 s × 2^(n-1). */
    expect(slept).toEqual([500, 1000, 2000]);
    expect(high.slept.map(Math.round)).toEqual([1000, 2000, 4000]);
  });

  it('leaves a wait longer than ten seconds to the caller rather than holding the request', async () => {
    const { fetch, calls } = scripted([answer(429, { 'retry-after': '60' }), answer(200)]);
    const { sleep, slept } = waits();
    const response = await createRevisionHttpClient({
      fetch,
      retry: { sleep },
    }).request({ url });

    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('60');
    expect(calls()).toBe(1);
    expect(slept).toEqual([]);
  });

  it('never retries a keepalive request, whose page is already going away', async () => {
    const { fetch, calls } = scripted([answer(429, { 'retry-after': '1' }), answer(200)]);
    const { sleep } = waits();
    const response = await createRevisionHttpClient({
      fetch,
      keepalive: true,
      retry: { sleep },
    }).request({
      url,
      method: 'POST',
      body: oneChunk(encoder.encode('PACK')),
    });
    expect(response.statusCode).toBe(429);
    expect(calls()).toBe(1);
  });

  it('only replays a body it holds whole: a body it could not buffer is not sent twice', async () => {
    /* The library's body is an iterator that can be read once. The client reads it
     * into one buffer before the first attempt, so every replay sends those bytes;
     * a request whose body could not be read whole is never sent at all. */
    let reads = 0;
    const once: AsyncIterableIterator<Uint8Array<ArrayBuffer>> = {
      next: async () => {
        reads += 1;
        return reads === 1 ? { done: false, value: encoder.encode('PACK-once') } : { done: true, value: undefined };
      },
      [Symbol.asyncIterator]: () => once,
    };
    const { fetch, bodies } = scripted([
      answer(503, { 'retry-after': '1' }),
      answer(429, { 'retry-after': '1' }),
      answer(200),
    ]);
    const { sleep } = waits();
    await createRevisionHttpClient({ fetch, retry: { sleep } }).request({
      url,
      method: 'POST',
      body: once,
    });
    expect(bodies).toEqual(['PACK-once', 'PACK-once', 'PACK-once']);
    expect(reads).toBe(2);
  });

  it('stops waiting when the request is aborted and sends nothing more', async () => {
    const { fetch, calls } = scripted([answer(429, { 'retry-after': '2' }), answer(200)]);
    const abort = new AbortController();
    const client = createRevisionHttpClient({ fetch });

    const pending = client.request({ url, signal: abort.signal });
    await vi.waitFor(() => {
      expect(calls()).toBe(1);
    });
    abort.abort(new Error('deadline'));

    await expect(pending).rejects.toThrow('deadline');
    expect(calls()).toBe(1);
  });

  it('sends each request once when retries are off', async () => {
    const { fetch, calls } = scripted([answer(429, { 'retry-after': '1' }), answer(200)]);
    const response = await createRevisionHttpClient({
      fetch,
      retry: false,
    }).request({ url });
    expect(response.statusCode).toBe(429);
    expect(calls()).toBe(1);
  });
});
