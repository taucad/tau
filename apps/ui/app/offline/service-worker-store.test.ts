import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import {
  completeDocuments,
  fillFromHttpCache,
  installPrecache,
  readStoredUrls,
  subresourceKey,
} from '#offline/service-worker-store.js';
import type { PrecacheItem, StoreCache } from '#offline/service-worker-store.js';

const origin = 'https://tau.new';
const shell = `${origin}/w/__shell/__shell/index.html`;
const shellKey = `${shell}?__WB_REVISION__=abc`;
const root = `${origin}/assets/root-aaaaaaaa.js`;
const consent = `${origin}/assets/use-cookie-consent-bbbbbbbb.js`;
const items: readonly PrecacheItem[] = [
  { url: shell, cacheKey: shellKey, revisioned: true },
  { url: root, cacheKey: root, revisioned: false },
  { url: consent, cacheKey: consent, revisioned: false },
];
const cacheKeyFor = (url: string): string | undefined => items.find((item) => item.url === url)?.cacheKey;

describe('readStoredUrls', () => {
  it('should read every stored request’s URL from every cache', async () => {
    const cache = (urls: readonly string[]): StoreCache => {
      const stored = mock<StoreCache>();
      stored.keys.mockResolvedValue(urls.map((url) => new Request(url)));
      return stored;
    };
    await expect(readStoredUrls([cache([shellKey]), cache([root])])).resolves.toStrictEqual(new Set([shellKey, root]));
  });
});

describe('installPrecache', () => {
  it('should store what it can fetch, report the rest and never reject (D2)', async () => {
    const put = vi.fn<(key: string, response: Response) => Promise<void>>().mockResolvedValue();
    const fetchFile = vi.fn<(request: Request) => Promise<Response>>(async (request) => {
      if (request.url === consent) {
        throw new TypeError('Failed to fetch');
      }
      return new Response('file', { status: 200 });
    });

    const report = await installPrecache({ items, stored: new Set(), fetchFile, cache: { put }, origin });

    expect(report).toStrictEqual({
      stored: [shellKey, root],
      failed: [{ url: consent, reason: 'Failed to fetch' }],
      quotaExceeded: false,
    });
    expect(put.mock.calls.map(([key]) => key)).toStrictEqual([shellKey, root]);
  });

  it('should fetch documents past the HTTP cache and every entry without credentials', async () => {
    const fetchFile = vi.fn<(request: Request) => Promise<Response>>().mockResolvedValue(new Response('file'));
    await installPrecache({ items, stored: new Set(), fetchFile, cache: { put: async () => undefined }, origin });
    expect(fetchFile.mock.calls.map(([request]) => [request.url, request.cache, request.credentials])).toStrictEqual([
      [shell, 'reload', 'omit'],
      [root, 'default', 'omit'],
      [consent, 'default', 'omit'],
    ]);
  });

  it('should not fetch an entry already stored under its key', async () => {
    const fetchFile = vi.fn<(request: Request) => Promise<Response>>().mockResolvedValue(new Response('file'));
    const report = await installPrecache({
      items,
      stored: new Set([root, consent]),
      fetchFile,
      cache: { put: async () => undefined },
      origin,
    });
    expect(fetchFile).toHaveBeenCalledOnce();
    expect(report.stored).toStrictEqual([shellKey, root, consent]);
  });

  it('should not store an answer other than 200, and should report a quota error', async () => {
    const put = vi.fn<(key: string, response: Response) => Promise<void>>(async (key) => {
      if (key === root) {
        throw new DOMException('full', 'QuotaExceededError');
      }
    });
    const fetchFile = vi.fn<(request: Request) => Promise<Response>>(async (request) =>
      request.url === shell ? new Response('gone', { status: 404 }) : new Response('file'),
    );
    const report = await installPrecache({ items, stored: new Set(), fetchFile, cache: { put }, origin });
    expect(report.stored).toStrictEqual([consent]);
    expect(report.failed.map(({ url }) => url)).toStrictEqual([shell, root]);
    expect(report.quotaExceeded).toBe(true);
  });
});

describe('completeDocuments', () => {
  it('should serve a document only while its whole closure is stored', () => {
    const classes = { [shell]: [root, consent] };
    expect(completeDocuments(classes, cacheKeyFor, new Set([shellKey, root, consent]))).toStrictEqual(new Set([shell]));
    expect(completeDocuments(classes, cacheKeyFor, new Set([shellKey, root]))).toStrictEqual(new Set());
    expect(
      completeDocuments({ [shell]: [`${origin}/assets/unlisted-cccccccc.js`] }, cacheKeyFor, new Set([shellKey])),
    ).toStrictEqual(new Set());
  });
});

describe('subresourceKey', () => {
  const locate = (url: string, precached: readonly string[], assets: readonly string[] = []): unknown =>
    subresourceKey({
      url,
      cacheKeyFor,
      precached: new Set(precached),
      assets: new Set(assets),
      precacheName: 'tau-precache',
      assetCacheName: 'tau-assets',
    });

  it('should answer a file only from a cache that holds it', () => {
    expect(locate(root, [root])).toStrictEqual({ cacheName: 'tau-precache', key: root });
    expect(locate(shell, [shellKey])).toStrictEqual({ cacheName: 'tau-precache', key: shellKey });
    const lazy = `${origin}/assets/kernel-dddddddd.js`;
    expect(locate(lazy, [], [lazy])).toStrictEqual({ cacheName: 'tau-assets', key: lazy });
  });

  it('should give a miss no answer, so the request stays the browser’s own (D1, D3)', () => {
    expect(locate(consent, [root])).toBeUndefined();
    expect(locate(shell, [`${shell}?__WB_REVISION__=old`])).toBeUndefined();
    expect(locate(`${origin}/assets/kernel-dddddddd.js`, [root], [])).toBeUndefined();
  });

  it('should answer a hashed file another version of the worker stored in the precache', () => {
    const renamed = `${origin}/assets/root-eeeeeeee.js`;
    expect(locate(renamed, [renamed])).toStrictEqual({ cacheName: 'tau-precache', key: renamed });
  });
});

describe('fillFromHttpCache', () => {
  const wait = async (): Promise<void> => undefined;
  const onQuotaExceeded = async (): Promise<void> => undefined;

  it('should copy the page’s file from the HTTP cache only, never from the network', async () => {
    const put = vi.fn<(key: string, response: Response) => Promise<void>>().mockResolvedValue();
    const onStored = vi.fn<(url: string) => Promise<void>>().mockResolvedValue();
    const fetchFile = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('file', { status: 200 }));

    await expect(
      fillFromHttpCache({ url: root, fetchFile, cache: { put }, wait, onStored, onQuotaExceeded, delays: [1, 2] }),
    ).resolves.toBe(true);

    expect(fetchFile.mock.calls.map(([, init]) => init)).toStrictEqual([
      { cache: 'only-if-cached', mode: 'same-origin', credentials: 'same-origin' },
      { cache: 'only-if-cached', mode: 'same-origin', credentials: 'same-origin' },
    ]);
    expect(put).toHaveBeenCalledOnce();
    expect(onStored).toHaveBeenCalledExactlyOnceWith(root);
  });

  it('should leave no unhandled rejection when every attempt fails', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const fetchFile = vi
        .fn<(url: string, init: RequestInit) => Promise<Response>>()
        .mockRejectedValue(new TypeError('net::ERR_BLOCKED_BY_CLIENT'));
      await expect(
        fillFromHttpCache({
          url: consent,
          fetchFile,
          cache: { put: async () => undefined },
          wait,
          onStored: async () => undefined,
          onQuotaExceeded,
          delays: [1, 2, 3],
        }),
      ).resolves.toBe(false);
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(fetchFile).toHaveBeenCalledTimes(3);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('should not store an answer other than 200, and purge on a quota error', async () => {
    const quota = vi.fn<() => Promise<void>>().mockResolvedValue();
    const fetchFile = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('', { status: 504 }))
      .mockResolvedValueOnce(new Response('file', { status: 200 }));
    const put = vi
      .fn<(key: string, response: Response) => Promise<void>>()
      .mockRejectedValue(new DOMException('full', 'QuotaExceededError'));
    await expect(
      fillFromHttpCache({
        url: root,
        fetchFile,
        cache: { put },
        wait,
        onStored: async () => undefined,
        onQuotaExceeded: quota,
        delays: [1, 2, 3],
      }),
    ).resolves.toBe(false);
    expect(put).toHaveBeenCalledOnce();
    expect(quota).toHaveBeenCalledOnce();
  });
});
