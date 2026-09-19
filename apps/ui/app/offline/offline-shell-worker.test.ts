/**
 * B5 R3 invariants, exercised against a minimal `self`/`caches`/`fetch` fake:
 * all-or-nothing install, prior version survives an interrupted install, API
 * and cross-origin requests bypass the worker entirely, navigation falls back
 * to the neutral document offline, and stored responses replay their headers.
 */
import { expect, it } from 'vitest';
import {
  activateOfflineShell,
  classifyOfflineShellRequest,
  installOfflineShell,
  offlineShellCacheName,
  respondFromOfflineShell,
} from '#offline/offline-shell-worker.js';
import type {
  OfflineShellManifest,
  OfflineShellMessage,
  OfflineShellRequest,
  OfflineShellScope,
  ShellCache,
  ShellCacheStorage,
} from '#offline/offline-shell-worker.js';

const origin = 'https://tau.new';

const manifest: OfflineShellManifest = {
  version: 'v1',
  documents: ['/usage'],
  assets: ['/assets/entry-aaa.js', '/assets/app-bbb.css'],
};

const isolationHeaders = {
  'content-type': 'text/html; charset=utf-8',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'same-origin',
  'content-security-policy': "default-src 'self'",
};

type FakeCache = ShellCache & { readonly entries: Map<string, Response> };

type FakeScope = OfflineShellScope & {
  readonly caches: ShellCacheStorage & { readonly stores: Map<string, FakeCache> };
  readonly messages: OfflineShellMessage[];
  /** Paths the network refuses, simulating an interrupted install or an offline device. */
  readonly failures: Set<string>;
};

const createScope = (): FakeScope => {
  const messages: OfflineShellMessage[] = [];
  const failures = new Set<string>();
  const stores = new Map<string, FakeCache>();

  const fetch = async (input: string): Promise<Response> => {
    if (failures.has(input)) {
      throw new TypeError('Failed to fetch');
    }
    return new Response(`body:${input}`, { headers: isolationHeaders });
  };

  const createCache = (): FakeCache => {
    const entries = new Map<string, Response>();
    return {
      entries,
      addAll: async (requests) => {
        // The platform only adds entries when every request succeeded.
        const fetched = await Promise.all(
          requests.map(async (url) => {
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`addAll failed for ${url}`);
            }
            return [url, response] as const;
          }),
        );
        for (const [url, response] of fetched) {
          entries.set(url, response);
        }
      },
      put: async (key, response) => {
        entries.set(key, response);
      },
      match: async (key) => entries.get(key),
    };
  };

  return {
    location: { origin },
    messages,
    failures,
    fetch,
    clients: {
      matchAll: async () => [
        {
          postMessage: (message: OfflineShellMessage): void => {
            messages.push(message);
          },
        },
      ],
    },
    caches: {
      stores,
      open: async (cacheName) => {
        const existing = stores.get(cacheName) ?? createCache();
        stores.set(cacheName, existing);
        return existing;
      },
      keys: async () => [...stores.keys()],
      delete: async (cacheName) => stores.delete(cacheName),
    },
  };
};

const request = (url: string, overrides: Partial<OfflineShellRequest> = {}): OfflineShellRequest => ({
  url,
  method: 'GET',
  mode: 'no-cors',
  ...overrides,
});

const navigation = (url: string): OfflineShellRequest => request(url, { mode: 'navigate' });

it('installs a version only once every entry is stored', async () => {
  const scope = createScope();

  await installOfflineShell(scope, manifest);

  const cache = scope.caches.stores.get(offlineShellCacheName('v1'));
  expect([...(cache?.entries.keys() ?? [])]).toStrictEqual([
    '/assets/entry-aaa.js',
    '/assets/app-bbb.css',
    '/usage',
    '/__tau-offline-shell/v1.ready',
  ]);
  expect(scope.messages).toStrictEqual([{ type: 'tau-offline-shell', status: 'ready', version: 'v1' }]);
});

it('leaves the previous version usable when an install is interrupted', async () => {
  const scope = createScope();
  await installOfflineShell(scope, manifest);
  const next: OfflineShellManifest = { ...manifest, version: 'v2', assets: [...manifest.assets, '/assets/new-ccc.js'] };
  scope.failures.add('/assets/new-ccc.js');

  await expect(installOfflineShell(scope, next)).rejects.toThrow();

  expect(scope.caches.stores.has(offlineShellCacheName('v2'))).toBe(false);
  expect(scope.caches.stores.has(offlineShellCacheName('v1'))).toBe(true);
  expect(scope.messages.at(-1)).toStrictEqual(
    expect.objectContaining({ type: 'tau-offline-shell', status: 'failed', version: 'v2' }),
  );
  await expect(
    respondFromOfflineShell(scope, manifest, request(`${origin}/assets/entry-aaa.js`)),
  ).resolves.toBeDefined();
});

it('reports a quota failure instead of claiming offline readiness', async () => {
  const scope = createScope();
  const quota = new Error('no space');
  quota.name = 'QuotaExceededError';
  const cache = await scope.caches.open(offlineShellCacheName('v1'));
  cache.addAll = async () => {
    throw quota;
  };

  await expect(installOfflineShell(scope, manifest)).rejects.toThrow(quota);

  expect(scope.messages.at(-1)?.status).toBe('quota-exceeded');
});

it('retires superseded versions on activate', async () => {
  const scope = createScope();
  await installOfflineShell(scope, manifest);
  await installOfflineShell(scope, { ...manifest, version: 'v2' });

  const retired = await activateOfflineShell(scope, { ...manifest, version: 'v2' });

  expect(retired).toStrictEqual([offlineShellCacheName('v1')]);
  expect(await scope.caches.keys()).toStrictEqual([offlineShellCacheName('v2')]);
});

it('bypasses API, cross-origin, non-GET and unrelated requests', () => {
  const scope = createScope();

  for (const candidate of [
    request(`${origin}/api/v1/billing/usage`),
    request('https://api.tau.new/v1/billing/usage'),
    request(`${origin}/assets/entry-aaa.js`, { method: 'POST' }),
    navigation(`${origin}/projects`),
    navigation(`${origin}/assets/entry-aaa.js`.replace('/assets', '/other')),
  ]) {
    expect(classifyOfflineShellRequest(scope, manifest, candidate).kind).toBe('bypass');
  }
});

it('serves an allowlisted asset from the cache with its headers intact', async () => {
  const scope = createScope();
  await installOfflineShell(scope, manifest);
  scope.failures.add(`${origin}/assets/entry-aaa.js`);

  const response = await respondFromOfflineShell(scope, manifest, request(`${origin}/assets/entry-aaa.js`));

  expect(await response?.text()).toBe('body:/assets/entry-aaa.js');
  expect(response?.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
  expect(response?.headers.get('cross-origin-opener-policy')).toBe('same-origin');
  expect(response?.headers.get('content-security-policy')).toBe("default-src 'self'");
});

it('falls back to the neutral document when a shell navigation has no network', async () => {
  const scope = createScope();
  await installOfflineShell(scope, manifest);
  scope.failures.add(`${origin}/usage`);

  const response = await respondFromOfflineShell(scope, manifest, navigation(`${origin}/usage`));

  expect(await response?.text()).toBe('body:/usage');
  expect(response?.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
});

it('prefers the network for a shell navigation while online', async () => {
  const scope = createScope();
  await installOfflineShell(scope, manifest);

  const response = await respondFromOfflineShell(scope, manifest, navigation(`${origin}/usage`));

  expect(await response?.text()).toBe(`body:${origin}/usage`);
});

it('drops the redirect identity from a shell document, stored and served', async () => {
  // Hosts answer a prerendered `/usage` with `301 → /usage/`; a followed fetch
  // carries `redirected: true`, which a navigation may not be answered with.
  const scope = createScope();
  const followed = scope.fetch.bind(scope);
  (scope as { fetch: FakeScope['fetch'] }).fetch = async (input, init) => {
    const response = await followed(input, init);
    if (input.endsWith('/usage')) {
      Object.defineProperty(response, 'redirected', { value: true });
    }
    return response;
  };
  await installOfflineShell(scope, manifest);

  const cache = await scope.caches.open(offlineShellCacheName('v1'));
  const stored = await cache.match('/usage');
  expect(stored?.redirected).toBe(false);
  expect(stored?.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
  expect(await stored?.text()).toBe('body:/usage');

  const live = await respondFromOfflineShell(scope, manifest, navigation(`${origin}/usage`));
  expect(live?.redirected).toBe(false);
  expect(await live?.text()).toBe(`body:${origin}/usage`);
});

it('never serves from an incomplete cache', async () => {
  const scope = createScope();
  const cache = await scope.caches.open(offlineShellCacheName('v1'));
  await cache.put('/assets/entry-aaa.js', new Response('stale partial install'));
  scope.failures.add(`${origin}/assets/entry-aaa.js`);

  await expect(respondFromOfflineShell(scope, manifest, request(`${origin}/assets/entry-aaa.js`))).rejects.toThrow(
    TypeError,
  );
});
