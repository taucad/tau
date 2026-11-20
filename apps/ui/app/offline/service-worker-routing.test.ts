import { describe, expect, it } from 'vitest';
import {
  answerNavigation,
  answerSubresource,
  installMessage,
  isCachedOnFirstUse,
  navigationCandidate,
  readDocumentBuildId,
  workerClasses,
} from '#offline/service-worker-routing.js';
import { serviceWorkerMessageType } from '#offline/pwa-messages.js';
import type { NavigationCandidate, RequestFacts, StoreView } from '#offline/service-worker-routing.js';

const origin = 'https://tau.new';
const projectDocument = '/w/__shell/__shell/index.html';
const homeDocument = '/__shell/home/index.html';
const usageDocument = '/usage/index.html';
const precached = new Set([projectDocument, homeDocument, usageDocument]);
const isPrecached = (document: string): boolean => precached.has(document);

const navigation = (path: string, overrides: Partial<RequestFacts> = {}): RequestFacts => ({
  url: new URL(path, origin).toString(),
  method: 'GET',
  mode: 'navigate',
  cache: 'default',
  ...overrides,
});

const candidateFor = (path: string, overrides?: Partial<RequestFacts>): NavigationCandidate => {
  const candidate = navigationCandidate(navigation(path, overrides), origin, isPrecached);
  if (candidate === undefined) {
    expect.fail(`${path} has no worker class`);
  }
  return candidate;
};

describe('the worker classes', () => {
  it('should answer the project shell, the Home shell and the usage page from their built documents', () => {
    expect(
      workerClasses.map(({ routeClass, delivery, document }) => ({ id: routeClass.id, delivery, document })),
    ).toStrictEqual([
      { id: 'project', delivery: 'cache-first', document: projectDocument },
      { id: 'home', delivery: 'cache-first', document: homeDocument },
      { id: 'offline-shell', delivery: 'network-first', document: usageDocument },
    ]);
  });
});

describe('navigationCandidate', () => {
  it.each([
    ['/w/home/bracket-v2', 'project'],
    ['/w/home/bracket-v2/', 'project'],
    ['/w/acme/proj_01HZ%20x', 'project'],
    ['/', 'home'],
    ['/?source=pwa', 'home'],
    ['/usage', 'offline-shell'],
    ['/usage/', 'offline-shell'],
  ])('should take the navigation to %s for the %s class', (path, id) => {
    expect(candidateFor(path).workerClass.routeClass.id).toBe(id);
  });

  it.each([
    // React Router's data requests, the project preview and every other `/w/…` shape stay on the function.
    '/w/home/bracket-v2.data',
    '/w/home/bracket-v2/_.data',
    '/_.data',
    '/_root.data',
    '/w/home/bracket-v2/preview',
    '/w/home',
    // Marketing, API, auth, resource and other app pages have no worker class.
    '/pricing',
    '/product/cad',
    '/api/v1/projects',
    '/auth/sign-in',
    '/health/build',
    '/projects',
    '/settings',
    '/s/published-model',
    '/manifest.webmanifest',
  ])('should leave the navigation to %s to the browser', (path) => {
    expect(navigationCandidate(navigation(path), origin, isPrecached)).toBeUndefined();
  });

  it('should leave a request alone unless it is a same-origin GET navigation', () => {
    expect(navigationCandidate(navigation('/w/a/b', { method: 'POST' }), origin, isPrecached)).toBeUndefined();
    expect(navigationCandidate(navigation('/w/a/b', { mode: 'cors' }), origin, isPrecached)).toBeUndefined();
    expect(
      navigationCandidate({ ...navigation('/'), url: 'https://www.tau.new/w/a/b' }, origin, isPrecached),
    ).toBeUndefined();
  });

  it('should leave a class to the browser when its document is not in this worker’s precache', () => {
    // A self-host build has no `/usage` route, so its worker precaches no usage document.
    expect(navigationCandidate(navigation('/usage'), origin, (document) => document !== usageDocument)).toBeUndefined();
  });
});

describe('answerNavigation', () => {
  const answer = (
    path: string,
    facts: Partial<{ tauEntry: string; updatePending: boolean; cache: string; classComplete: boolean }> = {},
  ): ReturnType<typeof answerNavigation> =>
    answerNavigation({
      candidate: candidateFor(path),
      request: navigation(path, facts.cache === undefined ? {} : { cache: facts.cache }),
      tauEntry: facts.tauEntry,
      updatePending: facts.updatePending ?? false,
      classComplete: facts.classComplete ?? true,
    });

  it('should open a project from the precached shell, cache-first', () => {
    expect(answer('/w/home/bracket-v2')).toStrictEqual({ kind: 'cache-first', document: projectDocument });
  });

  it.each(['no-cache', 'reload', 'no-store'])(
    'should ask the network first on a reload (cache mode %s), so a reload never lands on a replaced deploy',
    (cache) => {
      expect(answer('/w/home/bracket-v2', { cache })).toStrictEqual({
        kind: 'network-first',
        document: projectDocument,
      });
    },
  );

  it('should ask the network first while a newer worker is installing or waiting (ruling OD3)', () => {
    expect(answer('/w/home/bracket-v2', { updatePending: true })).toStrictEqual({
      kind: 'network-first',
      document: projectDocument,
    });
  });

  it('should open Home from the Home shell only for a visit the deployed site gives the app', () => {
    expect(answer('/', { tauEntry: 'app' })).toStrictEqual({ kind: 'cache-first', document: homeDocument });
    expect(answer('/?source=pwa')).toStrictEqual({ kind: 'cache-first', document: homeDocument });
    // Marketing: no preference, the website preference, `?website`, or only campaign parameters.
    expect(answer('/')).toStrictEqual({ kind: 'network' });
    expect(answer('/', { tauEntry: 'website' })).toStrictEqual({ kind: 'network' });
    expect(answer('/?website', { tauEntry: 'app' })).toStrictEqual({ kind: 'network' });
    expect(answer('/?utm_source=launch&ref=hn')).toStrictEqual({ kind: 'network' });
  });

  it('should answer the usage page network-first, whatever the cache mode', () => {
    expect(answer('/usage')).toStrictEqual({ kind: 'network-first', document: usageDocument });
  });

  it('should never serve a shell whose class closure is not all stored, so the browser’s own navigation answers', () => {
    expect(answer('/w/home/bracket-v2', { classComplete: false })).toStrictEqual({ kind: 'network' });
    expect(answer('/', { tauEntry: 'app', classComplete: false })).toStrictEqual({ kind: 'network' });
    expect(answer('/usage', { classComplete: false })).toStrictEqual({ kind: 'network' });
  });
});

describe('isCachedOnFirstUse', () => {
  it.each(['/assets/route-Dq3Xc9.js', '/assets/replicad_single-abc.wasm', '/csharp-language/0f3a/runtime.dll'])(
    'should cache %s on first use',
    (path) => {
      expect(isCachedOnFirstUse({ url: `${origin}${path}`, method: 'GET' }, origin)).toBe(true);
    },
  );

  it.each([
    ['GET', 'https://cdn.example.com/assets/x.js'],
    ['GET', `${origin}/fonts/Geist-Variable.woff2`],
    ['GET', `${origin}/w/home/bracket-v2.data`],
    ['GET', `${origin}/__manifest`],
    ['POST', `${origin}/assets/x.js`],
  ])('should not cache %s %s', (method, url) => {
    expect(isCachedOnFirstUse({ url, method }, origin)).toBe(false);
  });
});

describe('answerSubresource', () => {
  const listed = new Set(['/assets/root-A.js', '/assets/blocked-B.js', projectDocument]);
  const view = (overrides: Partial<{ loaded: boolean; precached: string[]; assets: string[] }> = {}): StoreView => ({
    isLoaded: () => overrides.loaded ?? true,
    isListed: (url) => listed.has(url),
    hasPrecached: (url) => (overrides.precached ?? ['/assets/root-A.js', projectDocument]).includes(url),
    hasAsset: (url) => (overrides.assets ?? ['/assets/kernel-C.wasm']).includes(url),
  });
  const request = (path: string, overrides: Partial<RequestFacts> = {}): RequestFacts => ({
    url: new URL(path, origin).toString(),
    method: 'GET',
    mode: 'cors',
    cache: 'default',
    ...overrides,
  });

  it('should answer only what the index says a cache holds', () => {
    expect(answerSubresource(request('/assets/root-A.js'), origin, view())).toStrictEqual({
      kind: 'precache',
      url: '/assets/root-A.js',
    });
    expect(answerSubresource(request('/assets/kernel-C.wasm'), origin, view())).toStrictEqual({
      kind: 'asset',
      url: '/assets/kernel-C.wasm',
    });
  });

  it('should give a miss no answer, so the browser makes its own request, and keep the file afterwards', () => {
    expect(answerSubresource(request('/assets/lazy-D.js'), origin, view())).toStrictEqual({
      kind: 'browser',
      keep: '/assets/lazy-D.js',
    });
  });

  it('should leave a listed file the install could not store to the browser, with no second copy', () => {
    expect(answerSubresource(request('/assets/blocked-B.js'), origin, view())).toStrictEqual({
      kind: 'browser',
      keep: undefined,
    });
  });

  it('should answer nothing before the index has loaded', () => {
    expect(answerSubresource(request('/assets/root-A.js'), origin, view({ loaded: false }))).toStrictEqual({
      kind: 'browser',
      keep: undefined,
    });
  });

  it.each([
    request('/api/v1/projects'),
    request('/w/home/bracket-v2.data'),
    request('/assets/root-A.js', { method: 'POST' }),
    { ...request('/'), url: 'https://cdn.example.com/assets/root-A.js' },
  ])('should leave $method $url to the browser untouched', (facts) => {
    expect(answerSubresource(facts, origin, view())).toStrictEqual({ kind: 'browser', keep: undefined });
  });
});

describe('installMessage', () => {
  it('should report a completed install, a quota failure and any other failure', () => {
    expect(installMessage()).toStrictEqual({ type: serviceWorkerMessageType, status: 'ready' });
    expect(installMessage({ incomplete: [] })).toStrictEqual({ type: serviceWorkerMessageType, status: 'ready' });
    expect(installMessage({ error: new DOMException('full', 'QuotaExceededError') })).toMatchObject({
      status: 'quota-exceeded',
    });
    expect(installMessage({ error: new TypeError('Failed to fetch') })).toStrictEqual({
      type: serviceWorkerMessageType,
      status: 'failed',
      detail: 'Failed to fetch',
    });
  });

  it('should report a class it could not store for offline use as failed, though the install completed', () => {
    expect(installMessage({ incomplete: [projectDocument] })).toStrictEqual({
      type: serviceWorkerMessageType,
      status: 'failed',
      detail: `not stored for offline use: ${projectDocument}`,
    });
  });
});

describe('readDocumentBuildId', () => {
  it('should read the build id the root loader writes into a document, escaped or not', () => {
    expect(readDocumentBuildId('<script>window.ENV = {"TAU_BUILD_ID":"1795126317415"}</script>')).toBe(
      1_795_126_317_415,
    );
    expect(readDocumentBuildId(String.raw`enqueue("[\"TAU_BUILD_ID\":\"42\"]")`)).toBe(42);
    expect(readDocumentBuildId('<html></html>')).toBeUndefined();
  });
});
