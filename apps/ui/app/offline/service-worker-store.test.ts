import { describe, expect, it, vi } from 'vitest';
import { assetCacheName } from '#offline/pwa-messages.js';
import { cacheKeyOf, createWorkerStore, precacheCacheName } from '#offline/service-worker-store.js';
import type { StoreManifest, StoreScope } from '#offline/service-worker-store.js';

// Stands in for Workbox's expiration, whose IndexedDB the tests lack.
vi.mock('workbox-expiration', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Workbox's own export name.
  CacheExpiration: vi.fn(function () {
    return { updateTimestamp: async () => undefined, expireEntries: async () => undefined };
  }),
}));

const origin = 'https://tau.new';
const projectDocument = '/w/__shell/__shell/index.html';
const homeDocument = '/__shell/home/index.html';

const manifest: StoreManifest = {
  entries: [
    { url: projectDocument, revision: 'p1' },
    { url: homeDocument, revision: 'h1' },
    { url: '/assets/root-A.js', revision: null },
    { url: '/assets/project-B.js', revision: null },
  ],
  classes: {
    [projectDocument]: [projectDocument, '/assets/root-A.js', '/assets/project-B.js'],
    [homeDocument]: [homeDocument, '/assets/root-A.js'],
  },
};

/** An in-memory `CacheStorage`, keyed by request URL. */
const createCaches = (): StoreScope['caches'] & { readonly stores: Map<string, Map<string, Response>> } => {
  const stores = new Map<string, Map<string, Response>>();
  const open = (name: string): Cache => {
    const entries = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, entries);
    const urlOf = (request: RequestInfo | URL): string =>
      new URL(typeof request === 'string' || request instanceof URL ? request : request.url, origin).toString();
    return {
      match: async (request: RequestInfo | URL) => entries.get(urlOf(request))?.clone(),
      put: async (request: RequestInfo | URL, response: Response) => {
        entries.set(urlOf(request), response);
      },
      keys: async () => [...entries.keys()].map((url) => new Request(url)),
      delete: async (request: RequestInfo | URL) => entries.delete(urlOf(request)),
    } as unknown as Cache;
  };
  return {
    stores,
    open: async (name) => open(name),
    has: async (name) => stores.has(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
};

const ok = (body: string): Response => new Response(body, { status: 200 });

describe('createWorkerStore', () => {
  it('should install every entry it can fetch and never fail on one the worker cannot fetch', async () => {
    const caches = createCaches();
    const fetch = vi.fn<StoreScope['fetch']>(async (input) => {
      if (input.startsWith('/assets/project-B.js')) {
        // A content blocker refusing the worker's own request.
        throw new TypeError('Failed to fetch');
      }
      return ok(input);
    });
    const store = createWorkerStore({ caches, fetch }, manifest);

    await expect(store.install()).resolves.toStrictEqual({
      failed: ['/assets/project-B.js'],
      incomplete: [projectDocument],
    });
    expect(store.isClassComplete(homeDocument)).toBe(true);
    expect(store.isClassComplete(projectDocument)).toBe(false);
    expect(store.hasPrecached('/assets/root-A.js')).toBe(true);
    expect(store.hasPrecached('/assets/project-B.js')).toBe(false);
    // Revisioned entries bypass the HTTP cache; none carries credentials.
    expect(fetch).toHaveBeenCalledWith(cacheKeyOf({ url: homeDocument, revision: 'h1' }), {
      credentials: 'omit',
      cache: 'reload',
    });
    expect(fetch).toHaveBeenCalledWith('/assets/root-A.js', { credentials: 'omit', cache: 'default' });
  });

  it('should leave out a response that is not OK', async () => {
    const caches = createCaches();
    const fetch = vi.fn<StoreScope['fetch']>(async (input) =>
      input === '/assets/root-A.js' ? new Response('gone', { status: 404 }) : ok(input),
    );
    const store = createWorkerStore({ caches, fetch }, manifest);

    await expect(store.install()).resolves.toStrictEqual({
      failed: ['/assets/root-A.js'],
      incomplete: [projectDocument, homeDocument],
    });
  });

  it('should fail the install on a quota error', async () => {
    const caches = createCaches();
    const precache = await caches.open(precacheCacheName);
    vi.spyOn(precache, 'put').mockRejectedValue(new DOMException('full', 'QuotaExceededError'));
    vi.spyOn(caches, 'open').mockResolvedValue(precache);
    const store = createWorkerStore({ caches, fetch: async (input) => ok(input) }, manifest);

    await expect(store.install()).rejects.toMatchObject({ name: 'QuotaExceededError' });
  });

  it('should leave out an entry whose write fails for any other reason, and complete the install', async () => {
    const caches = createCaches();
    const precache = await caches.open(precacheCacheName);
    const put = precache.put.bind(precache);
    vi.spyOn(precache, 'put').mockImplementation(async (request, response) => {
      if (typeof request === 'string' && request.includes('/assets/project-B.js')) {
        throw new TypeError('The body was cut off mid-read');
      }
      await put(request, response);
    });
    vi.spyOn(caches, 'open').mockResolvedValue(precache);
    const store = createWorkerStore({ caches, fetch: async (input) => ok(input) }, manifest);

    await expect(store.install()).resolves.toStrictEqual({
      failed: ['/assets/project-B.js'],
      incomplete: [projectDocument],
    });
  });

  it('should load its index from the caches at start', async () => {
    const caches = createCaches();
    const installer = createWorkerStore({ caches, fetch: async (input) => ok(input) }, manifest);
    await installer.install();
    const assets = await caches.open(assetCacheName);
    await assets.put('/assets/lazy-C.js', ok('lazy'));

    const restarted = createWorkerStore({ caches, fetch: vi.fn() }, manifest);
    expect(restarted.isLoaded()).toBe(false);
    expect(restarted.hasPrecached('/assets/root-A.js')).toBe(false);
    await restarted.load();
    expect(restarted.isLoaded()).toBe(true);
    expect(restarted.hasPrecached('/assets/root-A.js')).toBe(true);
    expect(restarted.hasAsset('/assets/lazy-C.js')).toBe(true);
    expect(restarted.isClassComplete(projectDocument)).toBe(true);
    await expect(restarted.readPrecached(homeDocument).then(async (response) => response?.text())).resolves.toBe(
      cacheKeyOf({ url: homeDocument, revision: 'h1' }),
    );
  });

  it('should report the build its precached documents carry', async () => {
    const caches = createCaches();
    const fetch = async (input: string): Promise<Response> =>
      ok(input.startsWith(homeDocument) ? '<script>window.ENV = {"TAU_BUILD_ID":"42"}</script>' : input);
    const store = createWorkerStore({ caches, fetch }, manifest);
    await expect(store.readBuildId()).resolves.toBeUndefined();

    await store.install();

    await expect(store.readBuildId()).resolves.toBe(42);
  });

  it('should delete on activation what this list no longer names and a pre-fix worker’s precache', async () => {
    const caches = createCaches();
    const precache = await caches.open(precacheCacheName);
    await precache.put(cacheKeyOf({ url: homeDocument, revision: 'old' }), ok('old home'));
    await precache.put('/assets/root-A.js', ok('root'));
    await caches.open(`tau-precache-v2-${origin}/`);
    await caches.open(assetCacheName);
    const store = createWorkerStore({ caches, fetch: vi.fn() }, manifest);

    await store.activate();

    const keys = await precache.keys();
    expect(keys.map((request) => new URL(request.url).pathname)).toStrictEqual(['/assets/root-A.js']);
    await expect(caches.keys()).resolves.toStrictEqual([precacheCacheName, assetCacheName]);
  });

  it('should keep a file from the browser’s HTTP cache only, never downloading it', async () => {
    const caches = createCaches();
    const fetch = vi.fn<StoreScope['fetch']>(async () => ok('lazy'));
    const store = createWorkerStore({ caches, fetch }, manifest, { timing: { copyDelay: 0 } });
    await store.load();

    await store.keep('/assets/lazy-C.js');

    expect(fetch).toHaveBeenCalledExactlyOnceWith('/assets/lazy-C.js', {
      cache: 'only-if-cached',
      mode: 'same-origin',
      credentials: 'same-origin',
    });
    expect(store.hasAsset('/assets/lazy-C.js')).toBe(true);
  });

  it('should keep a copy the HTTP cache does not have yet pending, without an unhandled rejection, and drop it after a minute', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const caches = createCaches();
      let clock = 0;
      const fetch = vi
        .fn<StoreScope['fetch']>()
        .mockResolvedValueOnce(new Response('', { status: 504 }))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValue(new Response('', { status: 504 }));
      const store = createWorkerStore({ caches, fetch }, manifest, {
        timing: { copyDelay: 0, flushInterval: 0 },
        now: () => clock,
      });
      await store.load();

      await expect(store.keep('/assets/lazy-C.js')).resolves.toBeUndefined();
      expect(store.hasPending()).toBe(true);
      await expect(store.flush()).resolves.toBeUndefined();
      expect(store.hasPending()).toBe(true);
      clock = 60_001;
      await store.flush();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(store.hasPending()).toBe(false);
      expect(store.hasAsset('/assets/lazy-C.js')).toBe(false);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('should copy a pending file once a later request finds it in the HTTP cache', async () => {
    const caches = createCaches();
    const fetch = vi
      .fn<StoreScope['fetch']>()
      .mockResolvedValueOnce(new Response('', { status: 504 }))
      .mockResolvedValueOnce(ok('lazy'));
    const store = createWorkerStore({ caches, fetch }, manifest, { timing: { copyDelay: 0, flushInterval: 0 } });
    await store.load();

    await store.keep('/assets/lazy-C.js');
    expect(store.hasAsset('/assets/lazy-C.js')).toBe(false);
    await store.flush();

    expect(store.hasAsset('/assets/lazy-C.js')).toBe(true);
    expect(store.hasPending()).toBe(false);
  });
});
