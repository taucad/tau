/**
 * Tau offline shell service worker (B5 R1/R3).
 *
 * ## Supported offline contract
 *
 * | Environment | Supported launch | Necessary condition |
 * | --- | --- | --- |
 * | Web, warm tab | Re-render saved usage while the origin/API is down | Shell installed online; snapshot stored |
 * | Web, cold tab | Open `/usage` after closing every tab | A **complete** install of this worker's version plus a saved local profile/snapshot |
 * | Desktop (`tau://`) | Quit and reopen offline | Packaged assets — this worker is never registered there |
 * | `tau serve --ui` | Open usage while Tau Cloud is unreachable | The local daemon's own static server — this worker is never registered there |
 *
 * A first-ever offline visit has nothing downloaded and cannot work. Cleared
 * storage, private-mode eviction and a failed install all mean "offline
 * unavailable", never "zero usage": the page is told (`offlineShellMessageType`)
 * instead of being left to guess.
 *
 * ## Scope of caching
 *
 * Only two things are cached, both build outputs: the neutral prerendered shell
 * documents (no account HTML — see `root.tsx`'s preference-cookie allowlist) and
 * the hashed static assets those documents reference, generated from the real
 * Vite build manifest by `scripts/generate-offline-shell.ts`. Every API, auth,
 * payment, mutation and unrelated document request is passed straight through
 * and never enters a cache; private usage data belongs to B4's account-scoped
 * IndexedDB store, not here.
 *
 * Responses are stored and replayed whole, so `Cross-Origin-Opener-Policy`,
 * `Cross-Origin-Embedder-Policy`, `Cross-Origin-Resource-Policy`,
 * `Content-Security-Policy`, `Content-Type` and cache directives come back
 * exactly as the origin served them — a synthesised fallback would drop
 * cross-origin isolation and break local WASM/SharedArrayBuffer execution.
 *
 * Installs are versioned and all-or-nothing: a version's cache is only marked
 * ready once every entry is stored, an interrupted or failed install deletes
 * its own partial cache and leaves the previous version serving, and old
 * versions are retired in `activate` — which the browser only runs once no
 * client is using them (this worker never calls `skipWaiting`/`claim`).
 */

/** Build-generated description of one offline shell version. */
export type OfflineShellManifest = {
  /** Content digest of the shell; changing it makes the browser install a new version. */
  readonly version: string;
  /** Neutral prerendered document paths this worker may serve offline. */
  readonly documents: readonly string[];
  /** Same-origin absolute paths of the static assets those documents need. */
  readonly assets: readonly string[];
};

/** Status this worker posts to its clients. */
export type OfflineShellStatus = 'ready' | 'failed' | 'quota-exceeded';

/** `message.type` of every client message this worker posts. */
export const offlineShellMessageType = 'tau-offline-shell';

/** Message posted to page clients so an install failure is visible, not swallowed. */
export type OfflineShellMessage = {
  readonly type: typeof offlineShellMessageType;
  readonly status: OfflineShellStatus;
  readonly version: string;
  readonly detail?: string;
};

const cacheNamePrefix = 'tau-offline-shell-';

/**
 * Minimal structural views of the worker global.
 *
 * Deliberately narrower than the platform types: the TypeScript DOM library has
 * no `ServiceWorkerGlobalScope`, and a structural shape the real globals and a
 * test fake both satisfy avoids a cast on either side.
 */
export type OfflineShellScope = {
  readonly location: { readonly origin: string };
  readonly caches: ShellCacheStorage;
  readonly clients: { matchAll(options?: { includeUncontrolled?: boolean }): Promise<readonly ClientLike[]> };
  fetch(input: string, init?: RequestInit): Promise<Response>;
};

/** The `Cache` surface this worker uses. */
export type ShellCache = {
  addAll(requests: readonly string[]): Promise<void>;
  put(key: string, response: Response): Promise<void>;
  match(key: string): Promise<Response | undefined>;
};

/** The `CacheStorage` surface this worker uses. */
export type ShellCacheStorage = {
  open(cacheName: string): Promise<ShellCache>;
  keys(): Promise<readonly string[]>;
  delete(cacheName: string): Promise<boolean>;
};

type ClientLike = { postMessage(message: OfflineShellMessage): void };

/** Minimal structural view of an intercepted request. */
export type OfflineShellRequest = { readonly url: string; readonly method: string; readonly mode: string };

/** Cache name for one shell version. */
export const offlineShellCacheName = (version: string): string => `${cacheNamePrefix}${version}`;

/** Sentinel entry written last; its absence means the cache is incomplete. */
const readyKey = (version: string): string => `/__tau-offline-shell/${version}.ready`;

const postStatus = async (scope: OfflineShellScope, message: Omit<OfflineShellMessage, 'type'>): Promise<void> => {
  const clients = await scope.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: offlineShellMessageType, ...message });
  }
};

const isQuotaError = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');

/**
 * Install one shell version as a unit.
 *
 * Every document and asset is fetched and stored before the readiness sentinel
 * is written. Any failure deletes this version's cache and rethrows, so the
 * browser discards the worker and the previously installed version keeps
 * serving.
 *
 * @param scope - Worker global (or a test fake).
 * @param manifest - Build-generated shell description.
 * @returns Nothing; rejects when the version could not be completed.
 */
/**
 * A shell document with its redirect identity dropped.
 *
 * Hosts commonly answer a prerendered `/usage` with `301 → /usage/`. A followed
 * fetch then carries `redirected: true`, and a navigation request (redirect
 * mode `manual`) answered with such a response is a network error by spec —
 * so it can be neither stored for offline replay nor passed through online.
 * Only the redirect identity goes; status and every header stay.
 *
 * @param response - The followed fetch of a shell document.
 * @returns The same body, status and headers without the redirect flag.
 */
const shellDocument = (response: Response): Response =>
  response.redirected
    ? new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    : response;

export const installOfflineShell = async (scope: OfflineShellScope, manifest: OfflineShellManifest): Promise<void> => {
  const cacheName = offlineShellCacheName(manifest.version);
  const cache = await scope.caches.open(cacheName);
  try {
    // `addAll` is the platform's own all-or-nothing store: it adds nothing when
    // any request fails. Hashed assets cannot vary by session, so their default
    // request is fine.
    await cache.addAll([...manifest.assets]);
    await Promise.all(
      manifest.documents.map(async (path) => {
        // Documents are fetched with `omit` so the stored HTML is the neutral
        // one, never a session-rendered variant, and with `reload` so a stale
        // HTTP-cache entry cannot seed the shell.
        const response = await scope.fetch(path, { cache: 'reload', credentials: 'omit' });
        if (!response.ok) {
          throw new Error(`Offline shell document ${path} responded ${String(response.status)}`);
        }
        await cache.put(path, shellDocument(response));
      }),
    );
    await cache.put(readyKey(manifest.version), new Response('ready'));
  } catch (error) {
    await scope.caches.delete(cacheName);
    await postStatus(scope, {
      status: isQuotaError(error) ? 'quota-exceeded' : 'failed',
      version: manifest.version,
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  await postStatus(scope, { status: 'ready', version: manifest.version });
};

/**
 * Retire superseded shell versions.
 *
 * Only runs once the browser has no client left on the old worker, so deleting
 * every other `tau-offline-shell-*` cache cannot pull assets out from under an
 * open page.
 *
 * @param scope - Worker global (or a test fake).
 * @param manifest - Build-generated shell description.
 * @returns Names of the caches that were deleted.
 */
export const activateOfflineShell = async (
  scope: OfflineShellScope,
  manifest: OfflineShellManifest,
): Promise<readonly string[]> => {
  const keep = offlineShellCacheName(manifest.version);
  const cacheNames = await scope.caches.keys();
  const stale = cacheNames.filter((name) => name.startsWith(cacheNamePrefix) && name !== keep);
  await Promise.all(stale.map(async (name) => scope.caches.delete(name)));
  return stale;
};

const normalizePath = (pathname: string): string =>
  pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

/**
 * Decide how a request is served.
 *
 * `bypass` means this worker calls neither `respondWith` nor any cache, which
 * is how every API, auth, payment and cross-origin request is handled.
 *
 * @param scope - Worker global (or a test fake).
 * @param manifest - Build-generated shell description.
 * @param request - The intercepted request.
 * @returns The routing decision for this request.
 */
export const classifyOfflineShellRequest = (
  scope: OfflineShellScope,
  manifest: OfflineShellManifest,
  request: OfflineShellRequest,
): { readonly kind: 'bypass' } | { readonly kind: 'asset' | 'document'; readonly key: string } => {
  if (request.method !== 'GET') {
    return { kind: 'bypass' };
  }
  const url = new URL(request.url, scope.location.origin);
  if (url.origin !== scope.location.origin || url.pathname.startsWith('/api/')) {
    return { kind: 'bypass' };
  }
  const path = normalizePath(url.pathname);
  if (manifest.assets.includes(url.pathname)) {
    return { kind: 'asset', key: url.pathname };
  }
  if (request.mode === 'navigate' && manifest.documents.includes(path)) {
    return { kind: 'document', key: path };
  }
  return { kind: 'bypass' };
};

/**
 * Produce the response for a request this worker owns.
 *
 * Hashed assets are cache-first (immutable by filename); shell documents are
 * network-first with the cached neutral document as the offline fallback. Both
 * replay the stored response, headers included. Nothing is written to the cache
 * here — only a completed install populates it.
 *
 * @param scope - Worker global (or a test fake).
 * @param manifest - Build-generated shell description.
 * @param request - The intercepted request.
 * @returns The response to serve, or `undefined` when the request is not ours.
 */
export const respondFromOfflineShell = async (
  scope: OfflineShellScope,
  manifest: OfflineShellManifest,
  request: OfflineShellRequest,
): Promise<Response | undefined> => {
  const decision = classifyOfflineShellRequest(scope, manifest, request);
  if (decision.kind === 'bypass') {
    return undefined;
  }
  const cache = await scope.caches.open(offlineShellCacheName(manifest.version));
  const ready = await cache.match(readyKey(manifest.version));
  if (ready === undefined) {
    // An incomplete version never claims offline readiness.
    return scope.fetch(request.url);
  }
  if (decision.kind === 'asset') {
    return (await cache.match(decision.key)) ?? scope.fetch(request.url);
  }
  try {
    return shellDocument(await scope.fetch(request.url));
  } catch (error) {
    const cached = await cache.match(decision.key);
    if (cached === undefined) {
      throw error;
    }
    return cached;
  }
};

/**
 * Bind this worker's lifecycle to a scope.
 *
 * Deliberately no `skipWaiting()` and no `clients.claim()`: an open page keeps
 * the version whose chunks it already loaded, and the new version takes over
 * on the next cold start.
 *
 * @param scope - Worker global (or a test fake) with `addEventListener`.
 * @param manifest - Build-generated shell description.
 * @returns Nothing.
 */
export const attachOfflineShell = (
  scope: OfflineShellScope & {
    addEventListener(type: string, listener: (event: WorkerLifecycleEvent) => void): void;
  },
  manifest: OfflineShellManifest,
): void => {
  scope.addEventListener('install', (event) => {
    event.waitUntil?.(installOfflineShell(scope, manifest));
  });
  scope.addEventListener('activate', (event) => {
    event.waitUntil?.(activateOfflineShell(scope, manifest));
  });
  scope.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request === undefined || classifyOfflineShellRequest(scope, manifest, request).kind === 'bypass') {
      return;
    }
    const serve = async (): Promise<Response> =>
      (await respondFromOfflineShell(scope, manifest, request)) ?? scope.fetch(request.url);
    event.respondWith?.(serve());
  });
};

/** Structural view of the lifecycle events this worker listens for. */
export type WorkerLifecycleEvent = {
  waitUntil?: (promise: Promise<unknown>) => void;
  respondWith?: (response: Promise<Response>) => void;
  request?: OfflineShellRequest;
};

/** The worker global, plus the manifest the build injects into it. */
type InjectedGlobal = {
  // oxlint-disable-next-line @typescript-eslint/naming-convention -- esbuild define target, not a normal identifier.
  __TAU_OFFLINE_SHELL__?: OfflineShellManifest;
};

/*
 * `scripts/generate-offline-shell.ts` replaces this exact member expression
 * with the generated manifest. Anywhere else — a unit test, or the app bundle
 * that imports this module for its message type — it reads `undefined` and
 * nothing is registered.
 */
const injectedManifest = (globalThis as InjectedGlobal).__TAU_OFFLINE_SHELL__;

if (injectedManifest !== undefined) {
  attachOfflineShell(
    globalThis as unknown as OfflineShellScope & {
      addEventListener(type: string, listener: (event: WorkerLifecycleEvent) => void): void;
    },
    injectedManifest,
  );
}
