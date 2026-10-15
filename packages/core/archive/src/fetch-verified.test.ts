import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { fetchVerified } from '#fetch-verified.js';

const payload = new TextEncoder().encode('payload bytes');
const integrity = `sha256-${createHash('sha256').update(payload).digest('base64')}`;
const url = 'https://files.example.test/pkg/payload.whl';

type Route = (request: Request) => Response | Promise<Response>;

/** A recording fetch that answers from a list of routes, one per call, and fails loudly on an unplanned call. */
const scriptedFetch = (...routes: Route[]) => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(input, init);
    requests.push({ url: request.url, init });
    const route = routes[requests.length - 1];
    if (route === undefined) {
      throw new Error(`unexpected request ${request.url}`);
    }
    return route(request);
  });
  return { transport, requests };
};

const ok = (): Response => new Response(payload);

/**
 * A body that sends `payload` one byte every `byteIntervalMilliseconds` (or nothing when it is undefined) and errors when
 * the request is aborted, as the platform `fetch` does.
 */
const trickle = (request: Request, byteIntervalMilliseconds: number | undefined): Response => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      request.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          controller.error(request.signal.reason);
        },
        { once: true },
      );
      let offset = 0;
      const send = (): void => {
        if (offset === payload.byteLength) {
          controller.close();
          return;
        }
        controller.enqueue(payload.slice(offset, offset + 1));
        offset += 1;
        timer = setTimeout(send, byteIntervalMilliseconds);
      };
      if (byteIntervalMilliseconds !== undefined) {
        timer = setTimeout(send, byteIntervalMilliseconds);
      }
    },
  });
  return new Response(body);
};

describe('fetchVerified', () => {
  it('should return verified bytes and send no credentials', async () => {
    const { transport, requests } = scriptedFetch(ok);

    const bytes = await fetchVerified({
      url,
      integrity,
      byteLength: payload.byteLength,
      fetch: transport,
      signal: new AbortController().signal,
    });

    expect(new TextDecoder().decode(bytes)).toBe('payload bytes');
    expect(requests.map((request) => [request.url, request.init?.credentials])).toEqual([[url, 'omit']]);
  });

  it('should refuse bytes that do not match the pin', async () => {
    const { transport } = scriptedFetch(() => new Response('tampered bytes'));

    await expect(
      fetchVerified({ url, integrity, fetch: transport, signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      name: 'ArchiveError',
      code: 'INTEGRITY_MISMATCH',
      reason: 'digest',
      path: url,
    });
  });

  it('should retry 5xx and transport errors, then succeed', async () => {
    const { transport } = scriptedFetch(
      () => new Response('busy', { status: 503 }),
      () => {
        throw new TypeError('socket hang up');
      },
      ok,
    );

    const bytes = await fetchVerified({ url, integrity, fetch: transport, signal: new AbortController().signal });

    expect(bytes.byteLength).toBe(payload.byteLength);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('should not retry a 404 and report the status', async () => {
    const { transport } = scriptedFetch(() => new Response('missing', { status: 404 }));

    await expect(
      fetchVerified({ url, integrity, fetch: transport, signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      code: 'DOWNLOAD_FAILED',
      reason: 'http-status',
      detail: 'HTTP 404',
      message: `Download of ${url} failed (HTTP 404).`,
    });
    expect(transport).toHaveBeenCalledOnce();
  });

  it('should refuse a body longer or shorter than the declared byte length', async () => {
    const short = scriptedFetch(ok, ok, ok);
    const long = scriptedFetch(ok, ok, ok);

    await expect(
      fetchVerified({
        url,
        integrity,
        byteLength: payload.byteLength + 1,
        fetch: short.transport,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_FAILED', reason: 'byte-length' });
    await expect(
      fetchVerified({
        url,
        integrity,
        byteLength: payload.byteLength - 1,
        fetch: long.transport,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_FAILED', detail: `Stream exceeds ${payload.byteLength - 1} bytes.` });
  });

  describe('redirect policy', () => {
    const allow = (target: URL): boolean => target.hostname.endsWith('.githubusercontent.com');

    it('should follow an allowed https redirect by hand', async () => {
      const { transport, requests } = scriptedFetch(
        () =>
          new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/a' } }),
        ok,
      );

      await fetchVerified({
        url,
        integrity,
        redirect: { maximum: 2, allow },
        fetch: transport,
        signal: new AbortController().signal,
      });

      expect(requests.map((request) => [request.url, request.init?.redirect])).toEqual([
        [url, 'manual'],
        ['https://release-assets.githubusercontent.com/a', 'manual'],
      ]);
    });

    it.each([
      ['an origin the policy refuses', 'https://evil.example.test/a', 2],
      ['plain http', 'http://release-assets.githubusercontent.com/a', 2],
      ['one hop too many', 'https://release-assets.githubusercontent.com/a', 0],
    ])('should refuse %s without retrying', async (_label, location, maximum) => {
      const { transport } = scriptedFetch(() => new Response(null, { status: 302, headers: { location } }));

      await expect(
        fetchVerified({
          url,
          integrity,
          redirect: { maximum, allow },
          fetch: transport,
          signal: new AbortController().signal,
        }),
      ).rejects.toMatchObject({ code: 'DOWNLOAD_FAILED', reason: 'redirect' });
      expect(transport).toHaveBeenCalledOnce();
    });
  });

  it('should fail each attempt after 60 s without a byte and retry it', async () => {
    vi.useFakeTimers();
    try {
      const stalled = (request: Request): Response => trickle(request, undefined);
      const { transport } = scriptedFetch(stalled, stalled, stalled);

      const outcome = fetchVerified({ url, integrity, fetch: transport, signal: new AbortController().signal });
      const settled = expect(outcome).rejects.toMatchObject({
        code: 'DOWNLOAD_FAILED',
        reason: 'transport',
        detail: 'no bytes received for 60000 ms',
      });
      await vi.advanceTimersByTimeAsync(59_999);
      expect(transport).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(3 * 60_000);

      await settled;
      expect(transport).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should keep a slow body that keeps arriving past 60 s in total', async () => {
    vi.useFakeTimers();
    try {
      const { transport } = scriptedFetch((request) => trickle(request, 30_000));

      const outcome = fetchVerified({
        url,
        integrity,
        byteLength: payload.byteLength,
        fetch: transport,
        signal: new AbortController().signal,
      });
      await vi.advanceTimersByTimeAsync(30_000 * (payload.byteLength + 1));

      expect(new TextDecoder().decode(await outcome)).toBe('payload bytes');
      expect(transport).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should reject with the signal reason when aborted', async () => {
    const controller = new AbortController();
    const { transport } = scriptedFetch(() => {
      controller.abort(new Error('cancelled by caller'));
      throw new DOMException('aborted', 'AbortError');
    });

    await expect(fetchVerified({ url, integrity, fetch: transport, signal: controller.signal })).rejects.toThrow(
      'cancelled by caller',
    );
  });
});
