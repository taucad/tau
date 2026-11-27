/**
 * Warm the app from the marketing site (Tau progressive loading PL8, ruling OD6: on idle, never under Save-Data).
 *
 * On the app's own host the app's edge function serves these pages, so the app build's warm manifest is a same-origin
 * file. Once the page has loaded and is idle, this prefetches the app Home's interactive tier from it with
 * `<link rel="prefetch">`: lowest priority, into the HTTP cache, nothing evaluated, so the page's own paint and
 * interaction never wait on it. A first app open then finds its modules cached. Only the app's public hosts
 * ({@link appHosts}) serve the file; anywhere else (the marketing deploy's own host, a preview, local development) the
 * request would 404 and the browser would log that as a console error, so nothing is requested there.
 *
 * The manifest's path, shape and URL rules are the app's (`apps/ui/app/lib/warm-manifest.ts`); this site imports
 * nothing from the app, so they are repeated here. The app build checks every listed file is part of an interactive
 * tier and is no wasm, worker, kernel or viewer asset; this reader also refuses any URL outside the app's `/assets`.
 */

/** The app build's warm manifest on the app's host. */
export const appWarmManifestPath = '/__shell/warm.json';

/** The app's public hosts, where the app's edge function serves these pages beside the app build. */
export const appHosts: ReadonlySet<string> = new Set(['tau.new', 'taucad.dev']);

/**
 * Whether this page is served on an app host, the only place the warm manifest exists.
 *
 * @param hostname - The page's `location.hostname`.
 * @returns `true` on {@link appHosts}.
 */
export const servesAppWarmManifest = (hostname: string): boolean => appHosts.has(hostname);

/** The app route class a marketing visitor opens: Home, which every "open the app" link leads to. */
export const appWarmClass = 'home';

/** Milliseconds. How long after `load` a browser without `requestIdleCallback` (Safari) waits before warming. */
export const idleFallbackDelay = 1500;

/** The part of a window this module touches. */
export type WarmHost = Readonly<{
  location: Pick<Location, 'hostname'>;
  document: Pick<Document, 'readyState' | 'createElement' | 'head' | 'querySelectorAll'>;
  /** Read for `connection.saveData`, which the DOM library does not declare. */
  navigator: unknown;
  addEventListener: (type: 'load', listener: () => void, options: AddEventListenerOptions) => void;
  removeEventListener: (type: 'load', listener: () => void) => void;
  requestIdleCallback?: (callback: () => void) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  fetch: (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;
}>;

/**
 * Whether the visitor asked for reduced data use (`Save-Data`).
 *
 * @param navigator - The window's navigator.
 * @returns `true` when `navigator.connection.saveData` is set.
 */
export const prefersReducedData = (navigator: unknown): boolean => {
  if (typeof navigator !== 'object' || navigator === null) {
    return false;
  }
  const connection: unknown = Reflect.get(navigator, 'connection');
  return typeof connection === 'object' && connection !== null && Reflect.get(connection, 'saveData') === true;
};

/**
 * Whether a manifest URL may be prefetched: a hashed script or stylesheet of the app's `/assets`, never a wasm file or
 * a worker, never another origin.
 *
 * @param href - A URL from the manifest.
 * @returns `true` when it may be prefetched.
 */
export const isWarmableHref = (href: unknown): href is string =>
  typeof href === 'string' && /^\/assets\/[\w.~-]+\.(?:js|css)$/u.test(href) && !/worker/iu.test(href);

/**
 * The URLs of the app's Home tier in a fetched manifest.
 *
 * @param body - The parsed JSON body.
 * @returns The warmable URLs; empty when the body is not version 1 of the manifest.
 */
export const homeTierHrefs = (body: unknown): string[] => {
  if (typeof body !== 'object' || body === null || !('version' in body) || body.version !== 1) {
    return [];
  }
  const classes = 'classes' in body ? body.classes : undefined;
  const files: unknown = typeof classes === 'object' && classes !== null ? Reflect.get(classes, appWarmClass) : [];
  return Array.isArray(files) ? files.filter((href) => isWarmableHref(href)) : [];
};

/**
 * Fetch the warm manifest and add a prefetch link for each Home file the page does not already reference.
 *
 * @param host - The window.
 * @returns The URLs it added; empty when the manifest is absent.
 */
export async function warmAppHome(host: WarmHost): Promise<string[]> {
  let body: unknown;
  try {
    const response = await host.fetch(appWarmManifestPath, { credentials: 'same-origin', priority: 'low' });
    if (!response.ok) {
      return [];
    }
    body = await response.json();
  } catch {
    return [];
  }
  const present = new Set(
    [...host.document.querySelectorAll('link[href], script[src]')].map(
      (element) => element.getAttribute('href') ?? element.getAttribute('src'),
    ),
  );
  const hrefs = homeTierHrefs(body).filter((href) => !present.has(href));
  for (const href of hrefs) {
    const link = host.document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    host.document.head.append(link);
  }
  return hrefs;
}

/** This document's warm-up: none yet, waiting for load and idle, or started. */
let state: 'none' | 'scheduled' | 'started' = 'none';

/**
 * Schedule the warm-up once per document: after `load`, at the next idle period (with no `requestIdleCallback`,
 * {@link idleFallbackDelay} after `load`), only on an app host, and never under Save-Data. A page change aborts a
 * warm-up still waiting, and the next page schedules it again.
 *
 * @param signal - Cancels a warm-up that has not started.
 * @param host - The window; the global one by default.
 * @returns Whether a warm-up was scheduled by this call.
 */
export function scheduleAppWarm(signal: AbortSignal, host: WarmHost = globalThis): boolean {
  if (state !== 'none' || !servesAppWarmManifest(host.location.hostname) || prefersReducedData(host.navigator)) {
    return false;
  }
  state = 'scheduled';
  const warm = (): void => {
    if (signal.aborted || prefersReducedData(host.navigator)) {
      return;
    }
    state = 'started';
    void warmAppHome(host);
  };
  const afterLoad = (): void => {
    if (host.requestIdleCallback === undefined) {
      const handle = host.setTimeout(warm, idleFallbackDelay);
      signal.addEventListener('abort', () => {
        host.clearTimeout(handle);
      });
      return;
    }
    const handle = host.requestIdleCallback(warm);
    signal.addEventListener('abort', () => host.cancelIdleCallback?.(handle));
  };
  signal.addEventListener('abort', () => {
    if (state === 'scheduled') {
      state = 'none';
    }
  });
  if (host.document.readyState === 'complete') {
    afterLoad();
  } else {
    host.addEventListener('load', afterLoad, { once: true });
    signal.addEventListener('abort', () => {
      host.removeEventListener('load', afterLoad);
    });
  }
  return true;
}
